import type { BlockchainId, RawTransaction } from '@/types';
import type { BlockchainAdapter } from './types';
import { BlockchainApiError, withRetry, fetchWithTimeout } from '@/lib/errors';
import { fromUnixTime, isAfter, isBefore, startOfDay, endOfDay } from 'date-fns';
import { createHash } from 'crypto';

const BASE_URL = 'https://api.trongrid.io';

interface TronTx {
  txID: string;
  block_timestamp: number;
  raw_data: {
    contract: {
      type: string;
      parameter: {
        value: {
          amount?: number;
          owner_address?: string;
          to_address?: string;
        };
      };
    }[];
  };
  ret?: { contractRet: string }[];
}

interface TronTokenTx {
  transaction_id: string;
  block_timestamp: number;
  from: string;
  to: string;
  value: string;
  token_info?: {
    symbol?: string;
    address?: string;
    decimals?: number;
  };
}

const SUN = 1_000_000;

const B58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';

function hexToBase58(hex: string): string {
  if (!hex) return hex;
  const clean = hex.startsWith('0x') ? hex.slice(2) : hex;
  if (!/^[0-9a-fA-F]+$/.test(clean) || clean.length % 2 !== 0) return hex;

  const buf = Buffer.from(clean, 'hex');
  const h1 = createHash('sha256').update(buf).digest();
  const h2 = createHash('sha256').update(h1).digest();
  const full = Buffer.concat([buf, h2.slice(0, 4)]);

  let n = BigInt('0x' + full.toString('hex'));
  let result = '';
  while (n > 0n) {
    result = B58[Number(n % 58n)] + result;
    n /= 58n;
  }
  for (const byte of full) {
    if (byte !== 0) break;
    result = '1' + result;
  }
  return result;
}

export class TronGridAdapter implements BlockchainAdapter {
  readonly name = 'TronGrid';
  readonly supportedChains: BlockchainId[] = ['tron'];

  private async fetchTrxPage(
    address: string,
    minTs: number,
    maxTs: number,
    fingerprint?: string
  ): Promise<{ data: TronTx[]; meta?: { fingerprint?: string } }> {
    const url = new URL(`${BASE_URL}/v1/accounts/${address}/transactions`);
    url.searchParams.set('min_timestamp', minTs.toString());
    url.searchParams.set('max_timestamp', maxTs.toString());
    url.searchParams.set('limit', '200');
    url.searchParams.set('only_confirmed', 'true');
    if (fingerprint) url.searchParams.set('fingerprint', fingerprint);

    return withRetry(async () => {
      const res = await fetchWithTimeout(url.toString(), { next: { revalidate: 0 } });
      if (!res.ok) {
        throw new BlockchainApiError('tron', res.status, `HTTP ${res.status}`, res.status >= 500);
      }
      return res.json();
    }, 3, 1000);
  }

  private async fetchTrc20Page(
    address: string,
    minTs: number,
    maxTs: number,
    fingerprint?: string
  ): Promise<{ data: TronTokenTx[]; meta?: { fingerprint?: string } }> {
    const url = new URL(`${BASE_URL}/v1/accounts/${address}/transactions/trc20`);
    url.searchParams.set('min_timestamp', minTs.toString());
    url.searchParams.set('max_timestamp', maxTs.toString());
    url.searchParams.set('limit', '200');
    url.searchParams.set('only_confirmed', 'true');
    if (fingerprint) url.searchParams.set('fingerprint', fingerprint);

    return withRetry(async () => {
      const res = await fetchWithTimeout(url.toString(), { next: { revalidate: 0 } });
      if (!res.ok) {
        throw new BlockchainApiError('tron', res.status, `HTTP ${res.status}`, res.status >= 500);
      }
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
    const minTs = startDay.getTime();
    const maxTs = endDay.getTime();

    const transactions: RawTransaction[] = [];

    // Fetch native TRX transactions
    let fingerprint: string | undefined;
    do {
      await new Promise(r => setTimeout(r, 200));
      const result = await this.fetchTrxPage(walletAddress, minTs, maxTs, fingerprint);

      for (const tx of result.data) {
        if (tx.ret?.[0]?.contractRet !== 'SUCCESS') continue;
        const contract = tx.raw_data.contract[0];
        if (contract.type !== 'TransferContract') continue;

        const date = fromUnixTime(tx.block_timestamp / 1000);
        if (isBefore(date, startDay) || isAfter(date, endDay)) continue;

        const value = contract.parameter.value;
        const from = hexToBase58(value.owner_address ?? '');
        const to = hexToBase58(value.to_address ?? '');
        const amount = ((value.amount ?? 0) / SUN).toFixed(6);

        transactions.push({
          txHash: tx.txID,
          date,
          type: from.toLowerCase() === walletAddress.toLowerCase() ? 'send' : 'receive',
          assetSymbol: 'TRX',
          assetAddress: undefined,
          amount,
          fromAddress: from || undefined,
          toAddress: to || undefined,
          sourceApi: 'trongrid',
        });
      }

      fingerprint = result.meta?.fingerprint;
    } while (fingerprint);

    // Fetch TRC-20 token transactions
    fingerprint = undefined;
    do {
      await new Promise(r => setTimeout(r, 200));
      const result = await this.fetchTrc20Page(walletAddress, minTs, maxTs, fingerprint);

      for (const tx of result.data) {
        const date = fromUnixTime(tx.block_timestamp / 1000);
        if (isBefore(date, startDay) || isAfter(date, endDay)) continue;

        const decimals = tx.token_info?.decimals ?? 6;
        const rawBig = BigInt(tx.value);
        const factor = 10n ** BigInt(decimals);
        const whole = rawBig / factor;
        const remainder = rawBig % factor;
        const amount = `${whole}.${remainder.toString().padStart(decimals, '0')}`;

        transactions.push({
          txHash: tx.transaction_id,
          date,
          type: tx.from.toLowerCase() === walletAddress.toLowerCase() ? 'send' : 'receive',
          assetSymbol: tx.token_info?.symbol ?? 'UNKNOWN',
          assetAddress: tx.token_info?.address?.toLowerCase(),
          amount,
          fromAddress: tx.from,
          toAddress: tx.to,
          sourceApi: 'trongrid',
        });
      }

      fingerprint = result.meta?.fingerprint;
    } while (fingerprint);

    return transactions;
  }
}
