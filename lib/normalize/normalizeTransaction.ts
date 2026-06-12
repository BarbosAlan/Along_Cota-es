import type { RawTransaction, EnrichedTransaction, BlockchainId } from '@/types';

export function normalizeTransaction(
  raw: RawTransaction,
  blockchain: BlockchainId,
  walletAddress: string
): EnrichedTransaction {
  return {
    ...raw,
    blockchain,
    walletAddress: walletAddress.toLowerCase(),
    priceUsd: undefined,
    valueUsd: undefined,
    ptax: undefined,
    valueBrl: undefined,
  };
}

export function toDecimalString(rawValue: string | bigint, decimals: number): string {
  const value = typeof rawValue === 'string' ? BigInt(rawValue) : rawValue;
  const divisor = 10n ** BigInt(decimals);
  const whole = value / divisor;
  const remainder = value % divisor;
  if (remainder === 0n) return whole.toString();
  const fracStr = remainder.toString().padStart(decimals, '0').replace(/0+$/, '');
  return `${whole}.${fracStr}`;
}

export function truncateAddress(address: string, chars = 6): string {
  if (address.length <= chars * 2 + 2) return address;
  return `${address.slice(0, chars)}...${address.slice(-chars)}`;
}
