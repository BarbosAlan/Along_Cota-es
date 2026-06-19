import type { BlockchainId, RawTransaction } from '@/types';
import type { BlockchainAdapter } from './types';
import { BlockchainApiError, withRetry, fetchWithTimeout } from '@/lib/errors';
import { fromUnixTime, isAfter, isBefore, startOfDay, endOfDay } from 'date-fns';
import { toDecimalString } from '@/lib/normalize/normalizeTransaction';

// Lisk L2 (OP Stack, chain ID 1135) — block explorer: blockscout.lisk.com
const BASE_URL = 'https://blockscout.lisk.com/api';
const PAGE_SIZE = 100;
const GAP_MS = 250;

interface BlockscoutTx {
  hash: string;
  timeStamp: string;
  from: string;
  to: string;
  value: string;
  isError: string;
}

interface BlockscoutTokenTx {
  hash: string;
  timeStamp: string;
  from: string;
  to: string;
  value: string;
  tokenSymbol: string;
  tokenDecimal: string;
  contractAddress: string;
}

interface BlockscoutResponse<T> {
  status: string;
  message: string;
  result: T[] | string;
}

export class LiskAdapter implements BlockchainAdapter {
  readonly name = 'Lisk Blockscout';
  readonly supportedChains: BlockchainId[] = ['lisk'];

  private lastCall = 0;

  private async throttle(): Promise<void> {
    const now = Date.now();
    const wait = Math.max(0, this.lastCall + GAP_MS - now);
    if (wait > 0) await new Promise(r => setTimeout(r, wait));
    this.lastCall = Date.now();
  }

  private buildUrl(params: Record<string, string>): string {
    const url = new URL(BASE_URL);
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
    return url.toString();
  }

  private async getBlockByTimestamp(timestamp: number, closest: 'before' | 'after'): Promise<string> {
    const url = this.buildUrl({
      module: 'block',
      action: 'getblocknobytime',
      timestamp: timestamp.toString(),
      closest,
    });
    try {
      await this.throttle();
      const res = await fetchWithTimeout(url, { cache: 'no-store' });
      const data: { status: string; result: string } = await res.json();
      if (data.status === '1' && data.result) return data.result;
    } catch {
      // fallback: fetch all blocks and filter by date client-side
    }
    return closest === 'before' ? '99999999' : '0';
  }

  private async fetchPage<T>(url: string): Promise<T[]> {
    const res = await withRetry(async () => {
      await this.throttle();
      const r = await fetchWithTimeout(url, { next: { revalidate: 0 } });
      if (r.status === 429) throw new BlockchainApiError('lisk', 429, 'Rate limited', true);
      if (!r.ok) throw new BlockchainApiError('lisk', r.status, `HTTP ${r.status}`, r.status >= 500);
      return r;
    }, 3, 1000);

    const data: BlockscoutResponse<T> = await res.json();
    if (data.status === '0') {
      if (data.message === 'No transactions found') return [];
      throw new BlockchainApiError('lisk', 200, `${data.message}: ${String(data.result)}`, false);
    }
    return Array.isArray(data.result) ? data.result : [];
  }

  private async fetchAllPages<T>(baseParams: Record<string, string>): Promise<T[]> {
    const results: T[] = [];
    let page = 1;

    while (true) {
      const url = this.buildUrl({ ...baseParams, page: page.toString(), offset: PAGE_SIZE.toString() });
      const batch = await this.fetchPage<T>(url);
      results.push(...batch);
      if (batch.length < PAGE_SIZE) break;
      page++;
    }

    return results;
  }

  async getTransactions(
    walletAddress: string,
    startDate: Date,
    endDate: Date,
    _chain: BlockchainId
  ): Promise<RawTransaction[]> {
    if (!walletAddress.startsWith('0x')) {
      throw new BlockchainApiError(
        'lisk',
        400,
        'Endereço Lisk L1 (lsk...) não suportado: API desativada após migração para L2 em maio 2024. Use o endereço EVM (0x...) correspondente.',
        false
      );
    }

    const wallet = walletAddress.toLowerCase();
    const startDay = startOfDay(startDate);
    const endDay = endOfDay(endDate);

    const [startBlock, endBlock] = await Promise.all([
      this.getBlockByTimestamp(Math.floor(startDay.getTime() / 1000), 'after'),
      this.getBlockByTimestamp(Math.floor(endDay.getTime() / 1000), 'before'),
    ]);

    const baseParams = {
      module: 'account',
      address: wallet,
      startblock: startBlock,
      endblock: endBlock,
      sort: 'asc',
    };

    const nativeTxs = await this.fetchAllPages<BlockscoutTx>({ ...baseParams, action: 'txlist' });
    const tokenTxs = await this.fetchAllPages<BlockscoutTokenTx>({ ...baseParams, action: 'tokentx' });

    const transactions: RawTransaction[] = [];

    for (const tx of nativeTxs) {
      if (tx.isError === '1') continue;
      if (tx.value === '0') continue;

      const date = fromUnixTime(parseInt(tx.timeStamp));
      if (isBefore(date, startDay) || isAfter(date, endDay)) continue;

      transactions.push({
        txHash: tx.hash,
        date,
        type: tx.from.toLowerCase() === wallet ? 'send' : 'receive',
        assetSymbol: 'LSK',
        amount: toDecimalString(tx.value, 18),
        fromAddress: tx.from,
        toAddress: tx.to,
        sourceApi: 'lisk_api',
      });
    }

    for (const tx of tokenTxs) {
      if (tx.value === '0') continue;

      const date = fromUnixTime(parseInt(tx.timeStamp));
      if (isBefore(date, startDay) || isAfter(date, endDay)) continue;

      transactions.push({
        txHash: tx.hash,
        date,
        type: tx.from.toLowerCase() === wallet ? 'send' : 'receive',
        assetSymbol: tx.tokenSymbol,
        assetAddress: tx.contractAddress.toLowerCase(),
        amount: toDecimalString(tx.value, parseInt(tx.tokenDecimal) || 18),
        fromAddress: tx.from,
        toAddress: tx.to,
        sourceApi: 'lisk_api',
      });
    }

    return transactions;
  }
}
