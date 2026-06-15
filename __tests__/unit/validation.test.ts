import { describe, it, expect } from 'vitest';
import {
  searchRequestSchema,
  batchRequestSchema,
  quotesRequestSchema,
  exportRequestSchema,
  quotesExportRequestSchema,
} from '@/lib/validation';

const YESTERDAY = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
const VALID_EVM = '0x742d35Cc6634C0532925a3b8D4C9F5e5b0d5a15C';

// ── searchRequestSchema ─────────────────────────────────────────────────────

describe('searchRequestSchema', () => {
  it('accepts a valid request', () => {
    const result = searchRequestSchema.safeParse({
      walletAddress: VALID_EVM,
      startDate: '2024-01-01',
      endDate: YESTERDAY,
    });
    expect(result.success).toBe(true);
  });

  it('accepts forceRefresh flag', () => {
    const result = searchRequestSchema.safeParse({
      walletAddress: VALID_EVM,
      startDate: '2024-01-01',
      endDate: YESTERDAY,
      forceRefresh: true,
    });
    expect(result.success).toBe(true);
  });

  it('trims walletAddress whitespace', () => {
    const result = searchRequestSchema.safeParse({
      walletAddress: `  ${VALID_EVM}  `,
      startDate: '2024-01-01',
      endDate: YESTERDAY,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.walletAddress).toBe(VALID_EVM);
    }
  });

  it('rejects wallet address shorter than 10 characters', () => {
    const result = searchRequestSchema.safeParse({
      walletAddress: 'short',
      startDate: '2024-01-01',
      endDate: YESTERDAY,
    });
    expect(result.success).toBe(false);
  });

  it('rejects invalid startDate', () => {
    const result = searchRequestSchema.safeParse({
      walletAddress: VALID_EVM,
      startDate: 'not-a-date',
      endDate: YESTERDAY,
    });
    expect(result.success).toBe(false);
  });

  it('rejects invalid endDate', () => {
    const result = searchRequestSchema.safeParse({
      walletAddress: VALID_EVM,
      startDate: '2024-01-01',
      endDate: 'bad-date',
    });
    expect(result.success).toBe(false);
  });

  it('rejects startDate after endDate', () => {
    const result = searchRequestSchema.safeParse({
      walletAddress: VALID_EVM,
      startDate: '2024-06-01',
      endDate: '2024-01-01',
    });
    expect(result.success).toBe(false);
  });

  it('allows startDate equal to endDate', () => {
    const result = searchRequestSchema.safeParse({
      walletAddress: VALID_EVM,
      startDate: YESTERDAY,
      endDate: YESTERDAY,
    });
    expect(result.success).toBe(true);
  });

  it('rejects future endDate', () => {
    const future = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);
    const result = searchRequestSchema.safeParse({
      walletAddress: VALID_EVM,
      startDate: '2024-01-01',
      endDate: future,
    });
    expect(result.success).toBe(false);
  });
});

// ── batchRequestSchema ──────────────────────────────────────────────────────

describe('batchRequestSchema', () => {
  it('accepts exactly 1 address', () => {
    const result = batchRequestSchema.safeParse({
      addresses: [VALID_EVM],
      startDate: '2024-01-01',
      endDate: YESTERDAY,
    });
    expect(result.success).toBe(true);
  });

  it('accepts 10 addresses (maximum)', () => {
    const addresses = Array.from({ length: 10 }, (_, i) =>
      `0x${i.toString().padStart(4, '0')}abcdefabcdefabcdefabcdefabcdefabcdef`
    );
    const result = batchRequestSchema.safeParse({
      addresses,
      startDate: '2024-01-01',
      endDate: YESTERDAY,
    });
    expect(result.success).toBe(true);
  });

  it('rejects 0 addresses', () => {
    const result = batchRequestSchema.safeParse({
      addresses: [],
      startDate: '2024-01-01',
      endDate: YESTERDAY,
    });
    expect(result.success).toBe(false);
  });

  it('rejects 11 addresses', () => {
    const addresses = Array.from({ length: 11 }, () => VALID_EVM);
    const result = batchRequestSchema.safeParse({
      addresses,
      startDate: '2024-01-01',
      endDate: YESTERDAY,
    });
    expect(result.success).toBe(false);
  });

  it('rejects address shorter than 10 chars', () => {
    const result = batchRequestSchema.safeParse({
      addresses: ['short'],
      startDate: '2024-01-01',
      endDate: YESTERDAY,
    });
    expect(result.success).toBe(false);
  });
});

// ── quotesRequestSchema ─────────────────────────────────────────────────────

describe('quotesRequestSchema', () => {
  it('accepts valid input and uppercases the symbol', () => {
    // Must stay within 366-day window — use 30 days ago as start
    const thirtyDaysAgo = new Date(Date.now() - 30 * 86_400_000).toISOString().slice(0, 10);
    const result = quotesRequestSchema.safeParse({
      symbol: 'btc',
      startDate: thirtyDaysAgo,
      endDate: YESTERDAY,
    });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.symbol).toBe('BTC');
  });

  it('rejects empty symbol', () => {
    const result = quotesRequestSchema.safeParse({
      symbol: '',
      startDate: '2024-01-01',
      endDate: YESTERDAY,
    });
    expect(result.success).toBe(false);
  });

  it('rejects symbol longer than 20 characters', () => {
    const result = quotesRequestSchema.safeParse({
      symbol: 'TOOLONGSYMBOLNAME12345',
      startDate: '2024-01-01',
      endDate: YESTERDAY,
    });
    expect(result.success).toBe(false);
  });

  it('rejects date range longer than 366 days', () => {
    const result = quotesRequestSchema.safeParse({
      symbol: 'BTC',
      startDate: '2022-01-01',
      endDate: '2023-06-30', // 545 days
    });
    expect(result.success).toBe(false);
  });

  it('accepts exactly 366 days', () => {
    const result = quotesRequestSchema.safeParse({
      symbol: 'ETH',
      startDate: '2023-01-01',
      endDate: '2024-01-01', // 366 days (2023 is not leap year)
    });
    expect(result.success).toBe(true);
  });

  it('rejects future endDate', () => {
    const future = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);
    const result = quotesRequestSchema.safeParse({
      symbol: 'BTC',
      startDate: '2024-01-01',
      endDate: future,
    });
    expect(result.success).toBe(false);
  });
});

// ── exportRequestSchema ─────────────────────────────────────────────────────

describe('exportRequestSchema', () => {
  const validTx = {
    id: 'tx-1',
    txHash: '0xabc',
    date: '2024-01-15T12:00:00Z',
    type: 'receive',
    assetSymbol: 'ETH',
    amount: '1.5',
    priceUsd: 2500,
    valueUsd: 3750,
    ptax: 4.97,
    valueBrl: 18637.5,
    fromAddress: '0xfrom',
    toAddress: '0xto',
    sourceApi: 'etherscan',
    blockchain: 'ethereum',
  };

  it('accepts xlsx format', () => {
    const result = exportRequestSchema.safeParse({
      transactions: [validTx],
      format: 'xlsx',
      walletAddress: VALID_EVM,
    });
    expect(result.success).toBe(true);
  });

  it('accepts csv format', () => {
    const result = exportRequestSchema.safeParse({
      transactions: [validTx],
      format: 'csv',
      walletAddress: VALID_EVM,
    });
    expect(result.success).toBe(true);
  });

  it('rejects invalid format', () => {
    const result = exportRequestSchema.safeParse({
      transactions: [validTx],
      format: 'pdf',
      walletAddress: VALID_EVM,
    });
    expect(result.success).toBe(false);
  });

  it('accepts null pricing fields', () => {
    const tx = { ...validTx, priceUsd: null, valueUsd: null, ptax: null, valueBrl: null };
    const result = exportRequestSchema.safeParse({
      transactions: [tx],
      format: 'csv',
      walletAddress: VALID_EVM,
    });
    expect(result.success).toBe(true);
  });
});

// ── quotesExportRequestSchema ───────────────────────────────────────────────

describe('quotesExportRequestSchema', () => {
  const validQuote = {
    date: '2024-01-15',
    symbol: 'BTC',
    priceUsd: 42000,
    ptax: 4.97,
    priceBrl: 208740,
    priceSource: 'binance',
  };

  it('accepts valid quotes export request', () => {
    const result = quotesExportRequestSchema.safeParse({
      quotes: [validQuote],
      symbol: 'BTC',
      format: 'xlsx',
    });
    expect(result.success).toBe(true);
  });

  it('accepts quotes with null fields', () => {
    const q = { ...validQuote, priceUsd: null, ptax: null, priceBrl: null, priceSource: null };
    const result = quotesExportRequestSchema.safeParse({
      quotes: [q],
      symbol: 'BTC',
      format: 'csv',
    });
    expect(result.success).toBe(true);
  });
});
