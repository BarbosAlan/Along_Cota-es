import type { BlockchainId, RawTransaction, TokenMeta } from '@/types';
import type { BlockchainAdapter } from './types';
import { BlockchainApiError, withRetry, fetchWithTimeout } from '@/lib/errors';
import { fromUnixTime, isAfter, isBefore, startOfDay, endOfDay } from 'date-fns';

const BASE_URL = 'https://api.helius.xyz/v0';

interface HeliusTokenTransfer {
  mint?: string;
  fromUserAccount?: string;
  toUserAccount?: string;
  tokenAmount?: number;
  symbol?: string;
}

interface HeliusNativeTransfer {
  fromUserAccount?: string;
  toUserAccount?: string;
  amount?: number;
}

interface HeliusTx {
  signature: string;
  timestamp: number;
  type: string;
  tokenTransfers?: HeliusTokenTransfer[];
  nativeTransfers?: HeliusNativeTransfer[];
}

export class HeliusAdapter implements BlockchainAdapter {
  readonly name = 'Helius';
  readonly supportedChains: BlockchainId[] = ['solana'];

  private readonly apiKey: string;

  constructor(config: { apiKey?: string }) {
    this.apiKey = config.apiKey ?? '';
  }

  private async fetchPage(
    address: string,
    before?: string
  ): Promise<HeliusTx[]> {
    const url = new URL(`${BASE_URL}/addresses/${address}/transactions`);
    url.searchParams.set('api-key', this.apiKey);
    url.searchParams.set('limit', '100');
    if (before) url.searchParams.set('before', before);

    return withRetry(async () => {
      const res = await fetchWithTimeout(url.toString(), { next: { revalidate: 0 } });
      if (res.status === 429) throw new BlockchainApiError('solana', 429, 'Rate limited', true);
      if (!res.ok) {
        throw new BlockchainApiError('solana', res.status, `HTTP ${res.status}`, res.status >= 500);
      }
      return res.json();
    }, 3, 500);
  }

  async getTransactions(
    walletAddress: string,
    startDate: Date,
    endDate: Date,
    _chain: BlockchainId
  ): Promise<RawTransaction[]> {
    const startDay = startOfDay(startDate);
    const endDay = endOfDay(endDate);
    const transactions: RawTransaction[] = [];
    let before: string | undefined;
    let reachedStart = false;

    while (!reachedStart) {
      await new Promise(r => setTimeout(r, 50));
      const batch = await this.fetchPage(walletAddress, before);
      if (!batch.length) break;

      for (const tx of batch) {
        const date = fromUnixTime(tx.timestamp);

        if (isAfter(date, endDay)) continue;
        if (isBefore(date, startDay)) {
          reachedStart = true;
          break;
        }

        // Process native SOL transfers
        for (const nt of tx.nativeTransfers ?? []) {
          if (!nt.amount) continue;

          const from = nt.fromUserAccount?.toLowerCase();
          const to = nt.toUserAccount?.toLowerCase();
          const wallet = walletAddress.toLowerCase();

          if (from !== wallet && to !== wallet) continue;

          transactions.push({
            txHash: tx.signature,
            date,
            type: from === wallet ? 'send' : 'receive',
            assetSymbol: 'SOL',
            assetAddress: undefined,
            amount: (nt.amount / 1e9).toFixed(9),
            fromAddress: nt.fromUserAccount,
            toAddress: nt.toUserAccount,
            sourceApi: 'helius',
          });
        }

        // Process SPL token transfers
        for (const tt of tx.tokenTransfers ?? []) {
          if (!tt.tokenAmount) continue;

          const from = tt.fromUserAccount?.toLowerCase();
          const to = tt.toUserAccount?.toLowerCase();
          const wallet = walletAddress.toLowerCase();

          if (from !== wallet && to !== wallet) continue;

          transactions.push({
            txHash: tx.signature,
            date,
            type: from === wallet ? 'send' : 'receive',
            assetSymbol: tt.symbol ?? 'UNKNOWN',
            assetAddress: tt.mint?.toLowerCase(),
            amount: tt.tokenAmount.toString(),
            fromAddress: tt.fromUserAccount,
            toAddress: tt.toUserAccount,
            sourceApi: 'helius',
          });
        }
      }

      before = batch[batch.length - 1].signature;
      if (batch.length < 100) break;
    }

    return transactions;
  }

  async getTokenMetadata(
    tokenAddress: string,
    _chain: BlockchainId
  ): Promise<TokenMeta | undefined> {
    const url = new URL(`${BASE_URL}/token-metadata`);
    url.searchParams.set('api-key', this.apiKey);

    try {
      const res = await fetchWithTimeout(url.toString(), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mintAccounts: [tokenAddress] }),
        next: { revalidate: 86400 },
      });

      if (!res.ok) return undefined;

      const data: { onChainMetadata?: { metadata?: { data?: { symbol?: string; name?: string } } } }[] =
        await res.json();
      const meta = data[0]?.onChainMetadata?.metadata?.data;

      if (!meta) return undefined;

      return {
        blockchain: 'solana',
        tokenAddress: tokenAddress.toLowerCase(),
        symbol: meta.symbol ?? 'UNKNOWN',
        name: meta.name ?? 'Unknown Token',
        decimals: 9,
        sourceApi: 'helius',
      };
    } catch {
      return undefined;
    }
  }
}
