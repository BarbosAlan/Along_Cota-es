import type { BlockchainId, RawTransaction } from '@/types';
import type { BlockchainAdapter } from './types';
import { BlockchainApiError, withRetry, fetchWithTimeout } from '@/lib/errors';
import { fromUnixTime, isAfter, isBefore, startOfDay, endOfDay } from 'date-fns';

const BASE_URL = 'https://blockstream.info/api';

interface BstreamVin {
  prevout?: {
    scriptpubkey_address?: string;
    value?: number;
  };
}

interface BstreamVout {
  scriptpubkey_address?: string;
  value: number;
}

interface BstreamTx {
  txid: string;
  status: { confirmed: boolean; block_time?: number };
  vin: BstreamVin[];
  vout: BstreamVout[];
}

const SATOSHI = 100_000_000;

export class BlockstreamAdapter implements BlockchainAdapter {
  readonly name = 'Blockstream';
  readonly supportedChains: BlockchainId[] = ['bitcoin'];

  private async fetchTxPage(
    address: string,
    afterTxid?: string
  ): Promise<BstreamTx[]> {
    let url = `${BASE_URL}/address/${address}/txs/chain`;
    if (afterTxid) url += `/${afterTxid}`;

    return withRetry(async () => {
      const res = await fetchWithTimeout(url, { next: { revalidate: 0 } });
      if (res.status === 429) {
        throw new BlockchainApiError('bitcoin', 429, 'Rate limited', true);
      }
      if (!res.ok) {
        throw new BlockchainApiError('bitcoin', res.status, `HTTP ${res.status}`, res.status >= 500);
      }
      return res.json();
    }, 3, 2000);
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
    let afterTxid: string | undefined;
    let reachedStart = false;

    while (!reachedStart) {
      await new Promise(r => setTimeout(r, 200));
      const batch: BstreamTx[] = await this.fetchTxPage(walletAddress, afterTxid);

      if (!batch.length) break;

      for (const tx of batch) {
        if (!tx.status.confirmed || !tx.status.block_time) continue;

        const date = fromUnixTime(tx.status.block_time);

        if (isAfter(date, endDay)) continue;
        if (isBefore(date, startDay)) {
          reachedStart = true;
          break;
        }

        const inputAddresses = new Set(
          tx.vin.map(v => v.prevout?.scriptpubkey_address).filter(Boolean)
        );
        const isSend = inputAddresses.has(walletAddress);

        // Calculate BTC amount relevant to this wallet
        let amount = 0;
        if (isSend) {
          // Outgoing: sum of outputs NOT going back to our wallet
          for (const vout of tx.vout) {
            if (vout.scriptpubkey_address !== walletAddress) {
              amount += vout.value;
            }
          }
        } else {
          // Incoming: sum of outputs going to our wallet
          for (const vout of tx.vout) {
            if (vout.scriptpubkey_address === walletAddress) {
              amount += vout.value;
            }
          }
        }

        if (amount === 0) continue;

        const fromAddresses = [...inputAddresses].filter(Boolean) as string[];
        const toAddresses = tx.vout
          .map(v => v.scriptpubkey_address)
          .filter((a): a is string => !!a && a !== walletAddress);

        transactions.push({
          txHash: tx.txid,
          date,
          type: isSend ? 'send' : 'receive',
          assetSymbol: 'BTC',
          assetAddress: undefined,
          amount: (amount / SATOSHI).toFixed(8),
          fromAddress: fromAddresses[0],
          toAddress: toAddresses[0],
          sourceApi: 'blockstream',
        });
      }

      afterTxid = batch[batch.length - 1].txid;
      if (batch.length < 25) break; // Blockstream returns 25 per page
    }

    return transactions;
  }
}
