import { describe, it, expect } from 'vitest';
import {
  normalizeTransaction,
  toDecimalString,
  truncateAddress,
} from '@/lib/normalize/normalizeTransaction';
import { normalizeQuote } from '@/lib/normalize/normalizeQuote';
import type { RawTransaction } from '@/types';

// ── normalizeTransaction ──────────────────────────────────────────────────────

const BASE_RAW: RawTransaction = {
  txHash: 'abc123',
  date: new Date('2024-01-15T12:00:00Z'),
  type: 'receive',
  assetSymbol: 'ETH',
  assetAddress: undefined,
  amount: '1.5',
  fromAddress: '0xfrom',
  toAddress: '0xto',
  sourceApi: 'etherscan',
};

describe('normalizeTransaction', () => {
  it('spreads all RawTransaction fields into the result', () => {
    const result = normalizeTransaction(BASE_RAW, 'ethereum', '0xwallet');
    expect(result.txHash).toBe(BASE_RAW.txHash);
    expect(result.date).toBe(BASE_RAW.date);
    expect(result.type).toBe(BASE_RAW.type);
    expect(result.assetSymbol).toBe(BASE_RAW.assetSymbol);
    expect(result.amount).toBe(BASE_RAW.amount);
    expect(result.fromAddress).toBe(BASE_RAW.fromAddress);
    expect(result.toAddress).toBe(BASE_RAW.toAddress);
    expect(result.sourceApi).toBe(BASE_RAW.sourceApi);
  });

  it('attaches the blockchain and lowercased walletAddress', () => {
    const result = normalizeTransaction(BASE_RAW, 'ethereum', '0xABCDEF');
    expect(result.blockchain).toBe('ethereum');
    expect(result.walletAddress).toBe('0xabcdef');
  });

  it('sets all price fields to undefined', () => {
    const result = normalizeTransaction(BASE_RAW, 'ethereum', '0xwallet');
    expect(result.priceUsd).toBeUndefined();
    expect(result.valueUsd).toBeUndefined();
    expect(result.ptax).toBeUndefined();
    expect(result.valueBrl).toBeUndefined();
  });

  it('lowercases walletAddress regardless of input casing', () => {
    const upper = normalizeTransaction(BASE_RAW, 'solana', 'MYADDRESS');
    const lower = normalizeTransaction(BASE_RAW, 'solana', 'myaddress');
    expect(upper.walletAddress).toBe(lower.walletAddress);
  });

  it('works for a send transaction', () => {
    const send: RawTransaction = { ...BASE_RAW, type: 'send' };
    const result = normalizeTransaction(send, 'bitcoin', '0xme');
    expect(result.type).toBe('send');
    expect(result.blockchain).toBe('bitcoin');
  });
});

// ── toDecimalString ───────────────────────────────────────────────────────────

describe('toDecimalString', () => {
  it('returns whole number when remainder is zero', () => {
    expect(toDecimalString('1000000', 6)).toBe('1');
    expect(toDecimalString('1000000000000000000', 18)).toBe('1');
  });

  it('returns fractional part with trailing zeros stripped', () => {
    expect(toDecimalString('1500000', 6)).toBe('1.5');
    expect(toDecimalString('1050000', 6)).toBe('1.05');
  });

  it('handles zero value', () => {
    expect(toDecimalString('0', 6)).toBe('0');
    expect(toDecimalString(0n, 18)).toBe('0');
  });

  it('accepts bigint input', () => {
    expect(toDecimalString(2_000_000n, 6)).toBe('2');
    expect(toDecimalString(1_500_000n, 6)).toBe('1.5');
  });

  it('pads fractional part correctly (e.g. 0.000001)', () => {
    expect(toDecimalString('1', 6)).toBe('0.000001');
    expect(toDecimalString('10', 6)).toBe('0.00001');
  });

  it('handles large values without precision loss', () => {
    // 45_000_000 ADA in lovelace
    const lovelace = 45_000_000n * 1_000_000n;
    expect(toDecimalString(lovelace, 6)).toBe('45000000');
  });
});

// ── truncateAddress ───────────────────────────────────────────────────────────

describe('truncateAddress', () => {
  it('returns short addresses unchanged (≤ chars*2+2)', () => {
    // default chars=6 → threshold = 14
    expect(truncateAddress('0x1234')).toBe('0x1234');
    expect(truncateAddress('12345678901234')).toBe('12345678901234');
  });

  it('truncates long addresses to first6...last6', () => {
    const addr = '0xd8da6bf26964af9d7eed9e03e53415d37aa96045';
    const result = truncateAddress(addr);
    expect(result).toBe(`${addr.slice(0, 6)}...${addr.slice(-6)}`);
    expect(result.endsWith(addr.slice(-6))).toBe(true);
  });

  it('respects a custom chars parameter', () => {
    const addr = '0xd8da6bf26964af9d7eed9e03e53415d37aa96045';
    const result = truncateAddress(addr, 4);
    expect(result.startsWith(addr.slice(0, 4))).toBe(true);
    expect(result.endsWith(addr.slice(-4))).toBe(true);
    expect(result).toContain('...');
  });

  it('does not truncate addresses exactly at the threshold', () => {
    // chars=6 → threshold = 14 → address of length 14 is NOT truncated
    const borderline = 'a'.repeat(14);
    expect(truncateAddress(borderline)).toBe(borderline);
  });

  it('truncates addresses one character over the threshold', () => {
    const overThreshold = 'a'.repeat(15);
    expect(truncateAddress(overThreshold)).toContain('...');
  });
});

// ── normalizeQuote ────────────────────────────────────────────────────────────

describe('normalizeQuote', () => {
  const BASE = {
    symbol: 'BTC',
    quoteDate: new Date('2024-01-15T12:00:00Z'),
    sourceApi: 'binance',
  };

  it('formats the date as yyyy-MM-dd', () => {
    const result = normalizeQuote({ ...BASE, priceUsd: 42000 });
    expect(result.date).toBe('2024-01-15');
  });

  it('passes through priceUsd when it is already a plain number', () => {
    const result = normalizeQuote({ ...BASE, priceUsd: 42000 });
    expect(result.priceUsd).toBe(42000);
    expect(result.symbol).toBe('BTC');
    expect(result.source).toBe('binance');
  });

  it('calls .toNumber() when priceUsd is a Prisma Decimal object', () => {
    // Prisma Decimal objects have a toNumber() method instead of being plain numbers
    const prismaDecimal = { toNumber: () => 42000.5 };
    const result = normalizeQuote({ ...BASE, priceUsd: prismaDecimal });
    expect(result.priceUsd).toBe(42000.5);
  });

  it('maps sourceApi to source field', () => {
    const result = normalizeQuote({ ...BASE, priceUsd: 1, sourceApi: 'kraken' });
    expect(result.source).toBe('kraken');
  });
});
