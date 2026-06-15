import type { BlockchainId, RawTransaction, TokenMeta } from '@/types';
import type { BlockchainAdapter } from './types';
import { toDecimalString } from '@/lib/normalize/normalizeTransaction';
import { BlockchainApiError, withRetry, fetchWithTimeout } from '@/lib/errors';
import { fromUnixTime, isAfter, isBefore, startOfDay, endOfDay } from 'date-fns';

// Etherscan V2 supports all EVM chains via chainid parameter
const CHAIN_IDS: Partial<Record<BlockchainId, number>> = {
  ethereum: 1,
  polygon: 137,
  bnb: 56,
  arbitrum: 42161,
  base: 8453,
  optimism: 10,
};

const BASE_URL = 'https://api.etherscan.io/v2/api';
const PAGE_SIZE = 200; // keep page × offset well under the 10k Etherscan cap

interface EtherscanTx {
  hash: string;
  timeStamp: string;
  from: string;
  to: string;
  value: string;
  isError: string;
  functionName?: string;
}

interface EtherscanTokenTx {
  hash: string;
  timeStamp: string;
  from: string;
  to: string;
  value: string;
  tokenSymbol: string;
  tokenDecimal: string;
  contractAddress: string;
  isError?: string;
}

interface EtherscanResponse<T> {
  status: string;
  message: string;
  result: T[] | string;
}

export class EtherscanAdapter implements BlockchainAdapter {
  readonly name = 'Etherscan V2';
  readonly supportedChains: BlockchainId[] = ['ethereum', 'polygon', 'bnb', 'arbitrum', 'base', 'optimism'];

  private readonly apiKey: string;

  constructor(config: { apiKey?: string }) {
    this.apiKey = config.apiKey ?? '';
  }

  private buildUrl(chainId: number, params: Record<string, string>): string {
    const url = new URL(BASE_URL);
    url.searchParams.set('chainid', chainId.toString());
    url.searchParams.set('apikey', this.apiKey);
    for (const [k, v] of Object.entries(params)) {
      url.searchParams.set(k, v);
    }
    return url.toString();
  }

  private async getBlockByTimestamp(
    chainId: number,
    timestamp: number,
    closest: 'before' | 'after'
  ): Promise<string> {
    const url = this.buildUrl(chainId, {
      module: 'block',
      action: 'getblocknobytime',
      timestamp: timestamp.toString(),
      closest,
    });
    try {
      const res = await fetchWithTimeout(url, { cache: 'no-store' });
      const text = await res.text();
      const data: { status: string; result: string; message?: string } = JSON.parse(text);
      if (data.status === '1' && data.result) return data.result;
    } catch {
      // fall through to fallback
    }
    return closest === 'before' ? '99999999' : '0';
  }

  private async fetchPage<T>(
    url: string,
    chain: BlockchainId
  ): Promise<T[]> {
    const res = await withRetry(async () => {
      const r = await fetchWithTimeout(url, { next: { revalidate: 0 } });
      if (r.status === 429) {
        throw new BlockchainApiError(chain, 429, 'Rate limited', true);
      }
      if (!r.ok) {
        throw new BlockchainApiError(chain, r.status, `HTTP ${r.status}`, r.status >= 500);
      }
      return r;
    }, 3, 1000);

    const data: EtherscanResponse<T> = await res.json();

    if (data.status === '0') {
      if (data.message === 'No transactions found') return [];
      // Include both message and result for debugging
      throw new BlockchainApiError(
        chain, 200,
        `${data.message ?? 'NOTOK'}: ${String(data.result)}`,
        false
      );
    }

    return Array.isArray(data.result) ? data.result : [];
  }

  private async fetchAllPages<T extends { timeStamp?: string }>(
    chainId: number,
    chain: BlockchainId,
    baseParams: Record<string, string>,
    stopBefore?: Date
  ): Promise<T[]> {
    const results: T[] = [];
    let page = 1;
    // Etherscan hard limit: pageNo × offset ≤ 10,000
    const MAX_PAGE = Math.floor(10000 / PAGE_SIZE);

    while (true) {
      const url = this.buildUrl(chainId, {
        ...baseParams,
        page: page.toString(),
        offset: PAGE_SIZE.toString(),
      });

      const batch = await this.fetchPage<T>(url, chain);
      results.push(...batch);

      if (stopBefore && batch.length > 0) {
        const lastTs = batch[batch.length - 1].timeStamp;
        if (lastTs && fromUnixTime(parseInt(lastTs)) < stopBefore) break;
      }

      if (batch.length < PAGE_SIZE) break;
      if (page >= MAX_PAGE) break; // stop before exceeding 10k limit

      page++;

      // Etherscan free tier: 3 req/s — 400ms gap keeps us safely under
      await new Promise(r => setTimeout(r, 400));
    }

    return results;
  }

  async getTransactions(
    walletAddress: string,
    startDate: Date,
    endDate: Date,
    chain: BlockchainId
  ): Promise<RawTransaction[]> {
    const chainId = CHAIN_IDS[chain];
    if (!chainId) throw new Error(`Etherscan adapter: unsupported chain ${chain}`);

    const wallet = walletAddress.toLowerCase();

    const startDay = startOfDay(startDate);
    const endDay = endOfDay(endDate);

    // Convert date range to block numbers to avoid the 10k result-window limit
    // Sequential to respect the 3 req/s Etherscan free-tier limit
    const startBlock = await this.getBlockByTimestamp(
      chainId, Math.floor(startDay.getTime() / 1000), 'after'
    );
    await new Promise(r => setTimeout(r, 400));
    const endBlock = await this.getBlockByTimestamp(
      chainId, Math.floor(endDay.getTime() / 1000), 'before'
    );
    await new Promise(r => setTimeout(r, 400));

    const baseParams = {
      module: 'account',
      address: wallet,
      startblock: startBlock,
      endblock: endBlock,
      sort: 'asc',
    };

    // Sequential with gap — Etherscan free tier is 3 req/s
    const nativeTxs = await this.fetchAllPages<EtherscanTx>(chainId, chain, {
      ...baseParams,
      action: 'txlist',
    });
    await new Promise(r => setTimeout(r, 500));
    const tokenTxs = await this.fetchAllPages<EtherscanTokenTx>(chainId, chain, {
      ...baseParams,
      action: 'tokentx',
    });

    const native = chain === 'polygon' ? 'POL' : chain === 'bnb' ? 'BNB' : 'ETH';
    const nativeDecimals = 18;

    const transactions: RawTransaction[] = [];

    // Process native transactions
    for (const tx of nativeTxs) {
      if (tx.isError === '1') continue;
      if (tx.value === '0') continue;

      const date = fromUnixTime(parseInt(tx.timeStamp));
      if (isBefore(date, startDay) || isAfter(date, endDay)) continue;

      const from = tx.from.toLowerCase();
      const to = tx.to.toLowerCase();
      const type = from === wallet ? 'send' : 'receive';

      transactions.push({
        txHash: tx.hash,
        date,
        type,
        assetSymbol: native,
        assetAddress: undefined,
        amount: toDecimalString(tx.value, nativeDecimals),
        fromAddress: tx.from,
        toAddress: tx.to,
        sourceApi: 'etherscan',
      });
    }

    // Process ERC-20 token transfers
    for (const tx of tokenTxs) {
      const date = fromUnixTime(parseInt(tx.timeStamp));
      if (isBefore(date, startDay) || isAfter(date, endDay)) continue;

      const from = tx.from.toLowerCase();
      const to = tx.to.toLowerCase();
      const type = from === wallet ? 'send' : 'receive';

      const decimals = parseInt(tx.tokenDecimal) || 18;

      transactions.push({
        txHash: tx.hash,
        date,
        type,
        assetSymbol: tx.tokenSymbol,
        assetAddress: tx.contractAddress.toLowerCase(),
        amount: toDecimalString(tx.value, decimals),
        fromAddress: tx.from,
        toAddress: tx.to,
        sourceApi: 'etherscan',
      });
    }

    return transactions;
  }

  async getTokenMetadata(
    tokenAddress: string,
    chain: BlockchainId
  ): Promise<TokenMeta | undefined> {
    const chainId = CHAIN_IDS[chain];
    if (!chainId) return undefined;

    const url = this.buildUrl(chainId, {
      module: 'token',
      action: 'tokeninfo',
      contractaddress: tokenAddress,
    });

    try {
      const res = await fetchWithTimeout(url, { next: { revalidate: 86400 } });
      if (!res.ok) return undefined;

      const data = await res.json();
      if (!Array.isArray(data.result) || !data.result[0]) return undefined;

      const info = data.result[0];
      return {
        blockchain: chain,
        tokenAddress: tokenAddress.toLowerCase(),
        symbol: info.symbol ?? 'UNKNOWN',
        name: info.tokenName ?? 'Unknown Token',
        decimals: parseInt(info.divisor ?? '18'),
        sourceApi: 'etherscan',
      };
    } catch {
      return undefined;
    }
  }
}
