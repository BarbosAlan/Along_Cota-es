import type { BlockchainId, RawTransaction } from '@/types';
import type { BlockchainAdapter } from './types';
import { BlockchainApiError, withRetry, fetchWithTimeout } from '@/lib/errors';
import { fromUnixTime, isAfter, isBefore, startOfDay, endOfDay } from 'date-fns';

const KOIOS_BASE = 'https://api.koios.rest/api/v1';
const LOVELACE = 1_000_000;
const PAGE_SIZE = 1000;
const TX_INFO_BATCH = 100;

interface KoiosAddrTx {
  tx_hash: string;
  block_time: number;
}

interface KoiosUtxo {
  payment_addr: { bech32: string };
  value: string;
}

interface KoiosTxInfo {
  tx_hash: string;
  block_time: number;
  inputs: KoiosUtxo[];
  outputs: KoiosUtxo[];
}

export class KoiosAdapter implements BlockchainAdapter {
  readonly name = 'Koios';
  readonly supportedChains: BlockchainId[] = ['cardano'];

  private async getAddrTxs(address: string, offset: number): Promise<KoiosAddrTx[]> {
    const url = new URL(`${KOIOS_BASE}/address_txs`);
    url.searchParams.set('_address', address);
    url.searchParams.set('limit', PAGE_SIZE.toString());
    url.searchParams.set('offset', offset.toString());
    url.searchParams.set('order', 'block_time.desc');

    return withRetry(async () => {
      const res = await fetchWithTimeout(url.toString(), { next: { revalidate: 0 } });
      if (res.status === 429) throw new BlockchainApiError('cardano', 429, 'Rate limited', true);
      if (!res.ok) throw new BlockchainApiError('cardano', res.status, `HTTP ${res.status}`, res.status >= 500);
      return res.json();
    }, 3, 1500);
  }

  private async getTxInfo(hashes: string[]): Promise<KoiosTxInfo[]> {
    return withRetry(async () => {
      const res = await fetchWithTimeout(`${KOIOS_BASE}/tx_info`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ _tx_hashes: hashes }),
        next: { revalidate: 0 },
      } as RequestInit);
      if (res.status === 429) throw new BlockchainApiError('cardano', 429, 'Rate limited', true);
      if (!res.ok) throw new BlockchainApiError('cardano', res.status, `HTTP ${res.status}`, res.status >= 500);
      return res.json();
    }, 3, 1500);
  }

  async getTransactions(
    walletAddress: string,
    startDate: Date,
    endDate: Date,
    _chain: BlockchainId
  ): Promise<RawTransaction[]> {
    const startDay = startOfDay(startDate);
    const endDay = endOfDay(endDate);

    // Fetch all address txs ordered descending — stop when we pass startDay
    const allAddrTxs: KoiosAddrTx[] = [];
    let offset = 0;
    let reachedStart = false;

    while (!reachedStart) {
      const batch = await this.getAddrTxs(walletAddress, offset);
      if (!batch.length) break;

      for (const tx of batch) {
        const date = fromUnixTime(tx.block_time);
        if (isBefore(date, startDay)) {
          reachedStart = true;
          break;
        }
        if (!isAfter(date, endDay)) {
          allAddrTxs.push(tx);
        }
      }

      if (batch.length < PAGE_SIZE) break;
      offset += batch.length;
      await new Promise(r => setTimeout(r, 400));
    }

    if (!allAddrTxs.length) return [];

    // Fetch tx details in batches
    const transactions: RawTransaction[] = [];

    for (let i = 0; i < allAddrTxs.length; i += TX_INFO_BATCH) {
      const hashes = allAddrTxs.slice(i, i + TX_INFO_BATCH).map(t => t.tx_hash);
      const infos = await this.getTxInfo(hashes);

      for (const info of infos) {
        const date = fromUnixTime(info.block_time);
        const inputAddresses = new Set(info.inputs.map(inp => inp.payment_addr.bech32));
        const isSend = inputAddresses.has(walletAddress);

        // Sum lovelace relevant to this wallet using BigInt to avoid precision loss
        // on large stake pool / exchange wallets (values can exceed Number.MAX_SAFE_INTEGER)
        let lovelace = 0n;
        if (isSend) {
          for (const out of info.outputs) {
            if (out.payment_addr.bech32 !== walletAddress) {
              lovelace += BigInt(out.value);
            }
          }
        } else {
          for (const out of info.outputs) {
            if (out.payment_addr.bech32 === walletAddress) {
              lovelace += BigInt(out.value);
            }
          }
        }

        if (lovelace === 0n) continue;

        const fromAddresses = [...inputAddresses];
        const toAddresses = info.outputs
          .map(o => o.payment_addr.bech32)
          .filter(a => a !== walletAddress);

        transactions.push({
          txHash: info.tx_hash,
          date,
          type: isSend ? 'send' : 'receive',
          assetSymbol: 'ADA',
          amount: `${lovelace / BigInt(LOVELACE)}.${(lovelace % BigInt(LOVELACE)).toString().padStart(6, '0')}`,
          fromAddress: fromAddresses[0],
          toAddress: toAddresses[0],
          sourceApi: 'koios',
        });
      }

      if (i + TX_INFO_BATCH < allAddrTxs.length) {
        await new Promise(r => setTimeout(r, 400));
      }
    }

    return transactions;
  }
}
