import type { BlockchainId, RawTransaction } from '@/types';
import type { BlockchainAdapter } from './types';
import { BlockchainApiError, withRetry, fetchWithTimeout } from '@/lib/errors';
import { isAfter, isBefore, startOfDay, endOfDay } from 'date-fns';

// Public XRPL full-history node (XRPL Commons / Sologenic)
const XRPL_RPC = 'https://xrplcluster.com';

// Ripple epoch starts 2000-01-01 00:00:00 UTC = Unix 946684800
const RIPPLE_EPOCH_OFFSET = 946684800;

const PAGE_LIMIT = 200;

type XrpAmount = string | { value: string; currency: string; issuer: string };

interface XrplTx {
  meta: {
    delivered_amount?: XrpAmount;
    TransactionResult: string;
  };
  tx: {
    TransactionType: string;
    Account: string;
    Destination?: string;
    Amount?: XrpAmount;
    date?: number; // Ripple epoch seconds
    hash: string;
  };
  validated: boolean;
}

interface XrplAccountTxResult {
  status: string;
  account: string;
  transactions: XrplTx[];
  marker?: unknown;
}

interface XrplResponse {
  result: XrplAccountTxResult;
}

function rippleToDate(rippleTime: number): Date {
  return new Date((rippleTime + RIPPLE_EPOCH_OFFSET) * 1000);
}

function parseXrpAmount(amount: XrpAmount): { symbol: string; value: string } {
  if (typeof amount === 'string') {
    return { symbol: 'XRP', value: (parseInt(amount, 10) / 1_000_000).toFixed(6) };
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
  readonly name = 'XRPL JSON-RPC';
  readonly supportedChains: BlockchainId[] = ['xrp'];

  private async fetchPage(address: string, marker?: unknown): Promise<XrplAccountTxResult> {
    const body = {
      method: 'account_tx',
      params: [{
        account: address,
        limit: PAGE_LIMIT,
        forward: false, // newest-first so we can stop early at startDate
        ...(marker !== undefined ? { marker } : {}),
      }],
    };

    const data: XrplResponse = await withRetry(async () => {
      const res = await fetchWithTimeout(XRPL_RPC, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        next: { revalidate: 0 },
      });
      if (res.status === 429) throw new BlockchainApiError('xrp', 429, 'Rate limited', true);
      if (!res.ok) throw new BlockchainApiError('xrp', res.status, `HTTP ${res.status}`, res.status >= 500);
      return res.json();
    }, 3, 1000);

    return data.result;
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
    let marker: unknown = undefined;

    while (true) {
      const result = await this.fetchPage(walletAddress, marker);

      if (result.status !== 'success' || !result.transactions?.length) break;

      let reachedStart = false;
      for (const entry of result.transactions) {
        if (!entry.validated) continue;
        if (entry.meta.TransactionResult !== 'tesSUCCESS') continue;
        if (entry.tx.TransactionType !== 'Payment') continue;
        if (entry.tx.date === undefined) continue;

        const date = rippleToDate(entry.tx.date);

        // Fetching newest-first: once we pass startDay we're done
        if (isBefore(date, startDay)) {
          reachedStart = true;
          break;
        }

        // Skip transactions outside the requested window
        if (isAfter(date, endDay)) continue;

        const rawAmount = entry.meta.delivered_amount ?? entry.tx.Amount;
        if (!rawAmount) continue;

        const { symbol, value } = parseXrpAmount(rawAmount);
        const from = entry.tx.Account;
        const to = entry.tx.Destination ?? '';
        const type = from.toLowerCase() === walletAddress.toLowerCase() ? 'send' : 'receive';

        transactions.push({
          txHash: entry.tx.hash,
          date,
          type,
          assetSymbol: symbol,
          amount: value,
          fromAddress: from,
          toAddress: to,
          sourceApi: 'xrpl',
        });
      }

      if (reachedStart || !result.marker) break;
      marker = result.marker;
      await new Promise(r => setTimeout(r, 200));
    }

    return transactions;
  }
}
