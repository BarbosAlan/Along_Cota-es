import type { BlockchainId, RawTransaction } from '@/types';
import type { BlockchainAdapter } from './types';
import { BlockchainApiError, withRetry, fetchWithTimeout } from '@/lib/errors';
import { parseISO, isAfter, isBefore, startOfDay, endOfDay } from 'date-fns';

const DATA_BASE = 'https://data.ripple.com/v2';
const XRP_DROPS = 1_000_000;
const PAGE_LIMIT = 200;

type XrpAmount = string | { value: string; currency: string; issuer: string };

interface RippleTx {
  hash: string;
  date: string;
  tx: {
    TransactionType: string;
    Account: string;
    Destination?: string;
    Amount?: XrpAmount;
  };
  meta?: {
    delivered_amount?: XrpAmount;
  };
}

interface RippleResponse {
  result: string;
  count: number;
  marker?: string;
  transactions: RippleTx[];
}

function parseXrpAmount(amount: XrpAmount): { symbol: string; value: string } {
  if (typeof amount === 'string') {
    return { symbol: 'XRP', value: (parseInt(amount, 10) / XRP_DROPS).toFixed(6) };
  }
  if (amount.currency.length === 3) {
    return { symbol: amount.currency, value: amount.value };
  }
  // 40-char hex extended currency — attempt ASCII decode
  try {
    const bytes = Buffer.from(amount.currency, 'hex');
    const text = bytes.toString('ascii').replace(/\0/g, '').trim();
    return { symbol: text || amount.currency.slice(0, 8), value: amount.value };
  } catch {
    return { symbol: amount.currency.slice(0, 8), value: amount.value };
  }
}

export class XrpAdapter implements BlockchainAdapter {
  readonly name = 'Ripple Data API';
  readonly supportedChains: BlockchainId[] = ['xrp'];

  private async fetchPage(
    address: string,
    start: Date,
    end: Date,
    marker?: string
  ): Promise<RippleResponse> {
    const url = new URL(`${DATA_BASE}/accounts/${address}/transactions`);
    url.searchParams.set('type', 'Payment');
    url.searchParams.set('result', 'tesSUCCESS');
    url.searchParams.set('start', start.toISOString());
    url.searchParams.set('end', end.toISOString());
    url.searchParams.set('limit', PAGE_LIMIT.toString());
    if (marker) url.searchParams.set('marker', marker);

    return withRetry(async () => {
      const res = await fetchWithTimeout(url.toString(), { next: { revalidate: 0 } });
      if (res.status === 429) throw new BlockchainApiError('xrp', 429, 'Rate limited', true);
      if (!res.ok) throw new BlockchainApiError('xrp', res.status, `HTTP ${res.status}`, res.status >= 500);
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
    let marker: string | undefined;

    while (true) {
      const data = await this.fetchPage(walletAddress, startDay, endDay, marker);

      if (data.result !== 'success' || !data.transactions?.length) break;

      for (const entry of data.transactions) {
        const date = parseISO(entry.date);
        if (isBefore(date, startDay) || isAfter(date, endDay)) continue;
        if (entry.tx.TransactionType !== 'Payment') continue;

        const rawAmount = entry.meta?.delivered_amount ?? entry.tx.Amount;
        if (!rawAmount) continue;

        const { symbol, value } = parseXrpAmount(rawAmount);
        const from = entry.tx.Account;
        const to = entry.tx.Destination ?? '';
        const type = from.toLowerCase() === walletAddress.toLowerCase() ? 'send' : 'receive';

        transactions.push({
          txHash: entry.hash,
          date,
          type,
          assetSymbol: symbol,
          amount: value,
          fromAddress: from,
          toAddress: to,
          sourceApi: 'ripple_data',
        });
      }

      marker = data.marker;
      if (!marker) break;
      await new Promise(r => setTimeout(r, 200));
    }

    return transactions;
  }
}
