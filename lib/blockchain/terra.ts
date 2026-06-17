import type { BlockchainId, RawTransaction } from '@/types';
import type { BlockchainAdapter } from './types';
import { BlockchainApiError, withRetry, fetchWithTimeout } from '@/lib/errors';
import { parseISO, isAfter, isBefore, startOfDay, endOfDay } from 'date-fns';

const LCD_BASE = 'https://terra-lcd.publicnode.com';
const ULUNA_DECIMALS = 6;
const PAGE_LIMIT = 100;

type CosmosCoin = { denom: string; amount: string };

interface CosmosMsg {
  '@type': string;
  from_address?: string;
  to_address?: string;
  amount?: CosmosCoin[];
}

interface TxResponse {
  txhash: string;
  timestamp: string; // ISO 8601
  code?: number;     // 0 or absent = success
  tx: {
    body: {
      messages: CosmosMsg[];
    };
  };
}

interface LcdTxsResponse {
  tx_responses: TxResponse[];
  pagination: {
    next_key: string | null;
    total: string;
  };
}

function ulunaToLuna(raw: string): string {
  const val = BigInt(raw);
  const divisor = 10n ** BigInt(ULUNA_DECIMALS);
  const whole = val / divisor;
  const rem = val % divisor;
  if (rem === 0n) return whole.toString();
  return `${whole}.${rem.toString().padStart(ULUNA_DECIMALS, '0').replace(/0+$/, '')}`;
}

function formatCoin(denom: string, amount: string): { symbol: string; value: string } {
  if (denom === 'uluna') return { symbol: 'LUNA', value: ulunaToLuna(amount) };
  if (denom.startsWith('ibc/')) return { symbol: `IBC/${denom.slice(4, 12)}`, value: amount };
  if (denom.startsWith('u')) return { symbol: denom.slice(1).toUpperCase(), value: amount };
  return { symbol: denom.toUpperCase(), value: amount };
}

export class TerraAdapter implements BlockchainAdapter {
  readonly name = 'Terra LCD';
  readonly supportedChains: BlockchainId[] = ['terra'];

  private async fetchTxPage(event: string, offset: number): Promise<LcdTxsResponse> {
    const url = new URL(`${LCD_BASE}/cosmos/tx/v1beta1/txs`);
    url.searchParams.set('query', event);
    url.searchParams.set('pagination.limit', PAGE_LIMIT.toString());
    url.searchParams.set('pagination.offset', offset.toString());
    url.searchParams.set('order_by', 'ORDER_BY_DESC');

    return withRetry(async () => {
      const res = await fetchWithTimeout(url.toString(), { next: { revalidate: 0 } });
      if (res.status === 429) throw new BlockchainApiError('terra', 429, 'Rate limited', true);
      if (!res.ok) throw new BlockchainApiError('terra', res.status, `HTTP ${res.status}`, res.status >= 500);
      return res.json();
    }, 3, 1000);
  }

  private parseMsgSends(
    txResp: TxResponse
  ): Array<{ symbol: string; value: string; from?: string; to?: string }> {
    // Non-zero code = failed transaction
    if (txResp.code && txResp.code !== 0) return [];

    const results: Array<{ symbol: string; value: string; from?: string; to?: string }> = [];
    for (const msg of txResp.tx.body.messages) {
      if (msg['@type'] !== '/cosmos.bank.v1beta1.MsgSend') continue;
      if (!msg.amount?.length) continue;
      for (const coin of msg.amount) {
        const { symbol, value } = formatCoin(coin.denom, coin.amount);
        results.push({ symbol, value, from: msg.from_address, to: msg.to_address });
      }
    }
    return results;
  }

  private async collectByEvent(
    event: string,
    txType: 'send' | 'receive',
    startDay: Date,
    endDay: Date,
    seen: Set<string>
  ): Promise<RawTransaction[]> {
    const transactions: RawTransaction[] = [];
    let offset = 0;

    while (true) {
      const data = await this.fetchTxPage(event, offset);
      if (!data.tx_responses?.length) break;

      let reachedStart = false;
      for (const txResp of data.tx_responses) {
        const date = parseISO(txResp.timestamp);

        // LCD returns newest-first — once past startDay we can stop
        if (isBefore(date, startDay)) {
          reachedStart = true;
          break;
        }
        if (isAfter(date, endDay)) continue;

        for (const send of this.parseMsgSends(txResp)) {
          const key = `${txResp.txhash}-${send.symbol}-${txType}`;
          if (seen.has(key)) continue;
          seen.add(key);
          transactions.push({
            txHash: txResp.txhash,
            date,
            type: txType,
            assetSymbol: send.symbol,
            amount: send.value,
            fromAddress: send.from,
            toAddress: send.to,
            sourceApi: 'terra_fcd',
          });
        }
      }

      if (reachedStart) break;
      const total = parseInt(data.pagination.total, 10);
      offset += data.tx_responses.length;
      if (offset >= total) break;
      await new Promise(r => setTimeout(r, 300));
    }

    return transactions;
  }

  async getTransactions(
    walletAddress: string,
    startDate: Date,
    endDate: Date,
    _chain: BlockchainId
  ): Promise<RawTransaction[]> {
    const startDay = startOfDay(startDate);
    const endDay = endOfDay(endDate);
    const seen = new Set<string>();

    const sent = await this.collectByEvent(
      `message.sender='${walletAddress}'`,
      'send',
      startDay,
      endDay,
      seen
    );
    const received = await this.collectByEvent(
      `transfer.recipient='${walletAddress}'`,
      'receive',
      startDay,
      endDay,
      seen
    );

    return [...sent, ...received];
  }
}
