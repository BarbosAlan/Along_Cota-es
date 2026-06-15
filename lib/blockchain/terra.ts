import type { BlockchainId, RawTransaction } from '@/types';
import type { BlockchainAdapter } from './types';
import { BlockchainApiError, withRetry, fetchWithTimeout } from '@/lib/errors';
import { parseISO, isAfter, isBefore, startOfDay, endOfDay } from 'date-fns';

const FCD_BASE = 'https://phoenix-fcd.terra.dev/v1';
const ULUNA_DECIMALS = 6;
const PAGE_LIMIT = 100;

interface TerraAmount {
  denom: string;
  amount: string;
}

interface TerraMsg {
  '@type': string;
  from_address?: string;
  to_address?: string;
  amount?: TerraAmount[];
}

interface TerraTx {
  txhash: string;
  timestamp: string;
  tx: {
    body: { messages: TerraMsg[] };
  };
}

interface FcdResponse {
  txs: TerraTx[];
  next?: number;
}

function ulunaToLuna(raw: string): string {
  const val = BigInt(raw);
  const divisor = 10n ** BigInt(ULUNA_DECIMALS);
  const whole = val / divisor;
  const rem = val % divisor;
  if (rem === 0n) return whole.toString();
  return `${whole}.${rem.toString().padStart(ULUNA_DECIMALS, '0').replace(/0+$/, '')}`;
}

export class TerraAdapter implements BlockchainAdapter {
  readonly name = 'Terra FCD';
  readonly supportedChains: BlockchainId[] = ['terra'];

  private async fetchPage(address: string, offset?: number): Promise<FcdResponse> {
    const url = new URL(`${FCD_BASE}/txs`);
    url.searchParams.set('account', address);
    url.searchParams.set('limit', PAGE_LIMIT.toString());
    if (offset !== undefined) url.searchParams.set('offset', offset.toString());

    return withRetry(async () => {
      const res = await fetchWithTimeout(url.toString(), { next: { revalidate: 0 } });
      if (res.status === 429) throw new BlockchainApiError('terra', 429, 'Rate limited', true);
      if (!res.ok) throw new BlockchainApiError('terra', res.status, `HTTP ${res.status}`, res.status >= 500);
      return res.json();
    }, 3, 1000);
  }

  async getTransactions(
    _walletAddress: string,
    _startDate: Date,
    _endDate: Date,
    _chain: BlockchainId
  ): Promise<RawTransaction[]> {
    // Terra FCD (phoenix-fcd.terra.dev) was decommissioned by Terraform Labs.
    // Non-retryable so the caller marks this chain as error immediately.
    throw new BlockchainApiError(
      'terra',
      503,
      'Fonte de dados Terra indisponível: endpoint FCD desativado. Aguardando integração com novo provedor.',
      false
    );
  }
}
