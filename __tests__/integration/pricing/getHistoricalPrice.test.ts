import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/db', () => ({
  db: {
    quote: {
      findUnique: vi.fn(),
      upsert: vi.fn(),
    },
  },
}));

vi.mock('@/lib/pricing/okx', () => ({ getOkxPrice: vi.fn() }));
vi.mock('@/lib/pricing/kraken', () => ({ getKrakenPrice: vi.fn() }));
vi.mock('@/lib/pricing/coingecko', () => ({ getCoingeckoPrice: vi.fn() }));
vi.mock('@/lib/pricing/ptax', () => ({ getPtax: vi.fn() }));

import { getHistoricalPrice } from '@/lib/pricing/getHistoricalPrice';
import { db } from '@/lib/db';
import { getOkxPrice } from '@/lib/pricing/okx';
import { getKrakenPrice } from '@/lib/pricing/kraken';
import { getCoingeckoPrice } from '@/lib/pricing/coingecko';
import { getPtax } from '@/lib/pricing/ptax';

function makeDbQuote(priceUsd: number, source = 'okx') {
  return {
    id: 'q1',
    symbol: 'BTC',
    quoteDate: new Date('2024-01-15'),
    priceUsd: { toNumber: () => priceUsd },
    priceBrl: null,
    sourceApi: source,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  // Default: no DB cache, PTAX available, upsert succeeds
  vi.mocked(db.quote.findUnique).mockResolvedValue(null);
  vi.mocked(db.quote.upsert).mockResolvedValue({} as never);
  vi.mocked(getPtax).mockResolvedValue({ date: '2024-01-15', usdBrl: 4.97 });
});

describe('getHistoricalPrice — DB cache', () => {
  it('returns cached quote without calling any pricing API', async () => {
    vi.mocked(db.quote.findUnique).mockResolvedValue(makeDbQuote(42000) as never);

    const result = await getHistoricalPrice('BTC', '2024-01-15');

    expect(result).not.toBeNull();
    expect(result?.priceUsd).toBe(42000);
    expect(result?.source).toBe('okx');
    expect(getOkxPrice).not.toHaveBeenCalled();
    expect(getKrakenPrice).not.toHaveBeenCalled();
    expect(getCoingeckoPrice).not.toHaveBeenCalled();
  });
});

describe('getHistoricalPrice — fallback chain', () => {
  it('uses OKX first when no cache', async () => {
    vi.mocked(getOkxPrice).mockResolvedValue(42000);

    const result = await getHistoricalPrice('BTC', '2024-01-15');

    expect(result?.priceUsd).toBe(42000);
    expect(result?.source).toBe('okx');
    expect(getKrakenPrice).not.toHaveBeenCalled();
    expect(getCoingeckoPrice).not.toHaveBeenCalled();
  });

  it('falls back to Kraken when OKX returns null', async () => {
    vi.mocked(getOkxPrice).mockResolvedValue(null);
    vi.mocked(getKrakenPrice).mockResolvedValue(41800);

    const result = await getHistoricalPrice('BTC', '2024-01-15');

    expect(result?.priceUsd).toBe(41800);
    expect(result?.source).toBe('kraken');
    expect(getCoingeckoPrice).not.toHaveBeenCalled();
  });

  it('falls back to CoinGecko when both OKX and Kraken return null', async () => {
    vi.mocked(getOkxPrice).mockResolvedValue(null);
    vi.mocked(getKrakenPrice).mockResolvedValue(null);
    vi.mocked(getCoingeckoPrice).mockResolvedValue(41500);

    const result = await getHistoricalPrice('OBSCURETOKEN', '2024-01-15');

    expect(result?.priceUsd).toBe(41500);
    expect(result?.source).toBe('coingecko');
  });

  it('returns null when all three sources return null', async () => {
    vi.mocked(getOkxPrice).mockResolvedValue(null);
    vi.mocked(getKrakenPrice).mockResolvedValue(null);
    vi.mocked(getCoingeckoPrice).mockResolvedValue(null);

    const result = await getHistoricalPrice('NODATA', '2024-01-15');

    expect(result).toBeNull();
  });

  it('returns null when all sources throw errors', async () => {
    vi.mocked(getOkxPrice).mockRejectedValue(new Error('Network error'));
    vi.mocked(getKrakenPrice).mockRejectedValue(new Error('Timeout'));
    vi.mocked(getCoingeckoPrice).mockRejectedValue(new Error('Rate limited'));

    const result = await getHistoricalPrice('BTC', '2024-01-15');

    expect(result).toBeNull();
  });

  it('upserts the quote to DB after a successful fetch', async () => {
    vi.mocked(getOkxPrice).mockResolvedValue(42000);

    await getHistoricalPrice('BTC', '2024-01-15');

    expect(db.quote.upsert).toHaveBeenCalledOnce();
    const call = vi.mocked(db.quote.upsert).mock.calls[0][0];
    expect(call.create.symbol).toBe('BTC');
    expect(call.create.priceUsd).toBe(42000);
  });
});

describe('getHistoricalPrice — symbol normalisation', () => {
  it('uppercases the symbol before querying', async () => {
    vi.mocked(getOkxPrice).mockResolvedValue(42000);

    await getHistoricalPrice('btc', '2024-01-15');

    expect(getOkxPrice).toHaveBeenCalledWith('BTC', '2024-01-15');
  });
});

describe('getHistoricalPrice — PTAX integration', () => {
  it('computes priceBrl when PTAX is available', async () => {
    vi.mocked(getOkxPrice).mockResolvedValue(42000);
    vi.mocked(getPtax).mockResolvedValue({ date: '2024-01-15', usdBrl: 5.0 });

    await getHistoricalPrice('BTC', '2024-01-15');

    const call = vi.mocked(db.quote.upsert).mock.calls[0][0];
    expect(call.create.priceBrl).toBeCloseTo(42000 * 5.0);
  });

  it('persists priceBrl as null when PTAX is unavailable', async () => {
    vi.mocked(getOkxPrice).mockResolvedValue(42000);
    vi.mocked(getPtax).mockRejectedValue(new Error('PTAX unavailable'));

    await getHistoricalPrice('BTC', '2024-01-15');

    const call = vi.mocked(db.quote.upsert).mock.calls[0][0];
    expect(call.create.priceBrl).toBeNull();
  });
});
