import type { BlockchainId, RawTransaction } from '@/types';
import type { BlockchainAdapter } from './types';
import { BlockchainApiError, withRetry, fetchWithTimeout } from '@/lib/errors';
import { fromUnixTime, isAfter, isBefore, startOfDay, endOfDay } from 'date-fns';

const SERVICE_BASE = 'https://service.lisk.com/api/v3';
const BEDDOWS_PER_LSK = 100_000_000n;
const PAGE_LIMIT = 100;
const NATIVE_TOKEN_ID = '0400000000000000';

interface LiskTx {
  id: string;
  moduleCommand: string;
  executionStatus: string;
  block: { timestamp: number };
  sender: { address: string };
  params: {
    recipientAddress?: string;
    amount?: string;
    tokenID?: string;
  };
}

interface LiskResponse {
  data: LiskTx[];
  meta: { total: number; count: number; offset: number };
}

function beddowsToLsk(raw: string): string {
  const val = BigInt(raw);
  const whole = val / BEDDOWS_PER_LSK;
  const rem = val % BEDDOWS_PER_LSK;
  if (rem === 0n) return whole.toString();
  return `${whole}.${rem.toString().padStart(8, '0').replace(/0+$/, '')}`;
}

export class LiskAdapter implements BlockchainAdapter {
  readonly name = 'Lisk Service';
  readonly supportedChains: BlockchainId[] = ['lisk'];

  private async fetchPage(address: string, offset: number): Promise<LiskResponse> {
    const url = new URL(`${SERVICE_BASE}/transactions`);
    url.searchParams.set('address', address);
    url.searchParams.set('moduleCommand', 'token:transfer');
    url.searchParams.set('executionStatus', 'successful');
    url.searchParams.set('limit', PAGE_LIMIT.toString());
    url.searchParams.set('offset', offset.toString());
    url.searchParams.set('sort', 'timestamp:desc');

    return withRetry(async () => {
      const res = await fetchWithTimeout(url.toString(), { next: { revalidate: 0 } });
      if (res.status === 429) throw new BlockchainApiError('lisk', 429, 'Rate limited', true);
      if (!res.ok) throw new BlockchainApiError('lisk', res.status, `HTTP ${res.status}`, res.status >= 500);
      return res.json();
    }, 3, 1000);
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
    let offset = 0;
    let reachedStart = false;

    while (!reachedStart) {
      const data = await this.fetchPage(walletAddress, offset);
      if (!data.data?.length) break;

      for (const tx of data.data) {
        const date = fromUnixTime(tx.block.timestamp);

        if (isAfter(date, endDay)) continue;
        if (isBefore(date, startDay)) {
          reachedStart = true;
          break;
        }

        const amount = tx.params.amount ?? '0';
        if (amount === '0') continue;

        const from = tx.sender.address;
        const to = tx.params.recipientAddress ?? '';
        const type = from.toLowerCase() === walletAddress.toLowerCase() ? 'send' : 'receive';
        const tokenId = tx.params.tokenID ?? NATIVE_TOKEN_ID;
        const symbol = tokenId === NATIVE_TOKEN_ID ? 'LSK' : tokenId;

        transactions.push({
          txHash: tx.id,
          date,
          type,
          assetSymbol: symbol,
          amount: beddowsToLsk(amount),
          fromAddress: from,
          toAddress: to,
          sourceApi: 'lisk_api',
        });
      }

      offset += data.data.length;
      if (offset >= data.meta.total || reachedStart) break;
      await new Promise(r => setTimeout(r, 300));
    }

    return transactions;
  }
}
