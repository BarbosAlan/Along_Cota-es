import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('@/lib/db', () => ({
  db: {
    ptaxRate: {
      findFirst: vi.fn(),
      create: vi.fn(),
    },
  },
}));

import { getPtax } from '@/lib/pricing/ptax';
import { db } from '@/lib/db';
import { PtaxNotFoundError } from '@/lib/errors';

afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

function stubBcbFetch(rate: number | null) {
  const body =
    rate !== null ? { value: [{ cotacaoVenda: rate }] } : { value: [] };
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve(body),
    })
  );
}

function makePtaxRow(usdBrl: number) {
  // ptax.ts calls Number(cached.usdBrl) — a plain number satisfies that
  return {
    id: '1',
    quoteDate: new Date('2024-01-15'),
    usdBrl: usdBrl as unknown as never,
    sourceApi: 'bcb_ptax',
    createdAt: new Date(),
  };
}

describe('getPtax — DB cache hit', () => {
  beforeEach(() => {
    vi.mocked(db.ptaxRate.create).mockResolvedValue({} as never);
  });

  it('returns the cached rate without fetching', async () => {
    vi.mocked(db.ptaxRate.findFirst).mockResolvedValue(makePtaxRow(4.97) as never);
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);

    const result = await getPtax('2024-01-15');

    expect(result.usdBrl).toBeCloseTo(4.97);
    expect(result.date).toBe('2024-01-15');
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe('getPtax — API fetch', () => {
  beforeEach(() => {
    vi.mocked(db.ptaxRate.findFirst).mockResolvedValue(null);
    vi.mocked(db.ptaxRate.create).mockResolvedValue({} as never);
  });

  it('fetches from BCB API and persists the result', async () => {
    stubBcbFetch(5.12);

    const result = await getPtax('2024-01-15');

    expect(result.usdBrl).toBe(5.12);
    expect(result.date).toBe('2024-01-15');
    expect(db.ptaxRate.create).toHaveBeenCalledOnce();
  });

  it('skips Saturday and returns the Friday rate', async () => {
    // 2024-01-06 = Saturday → should walk back to 2024-01-05 (Friday)
    stubBcbFetch(5.05);

    const result = await getPtax('2024-01-06');

    expect(result.usdBrl).toBe(5.05);
    expect(result.date).toBe('2024-01-05');
  });

  it('skips Sunday and returns the Friday rate', async () => {
    // 2024-01-07 = Sunday → should walk back to 2024-01-05 (Friday)
    stubBcbFetch(5.05);

    const result = await getPtax('2024-01-07');

    expect(result.usdBrl).toBe(5.05);
    expect(result.date).toBe('2024-01-05');
  });

  it('throws PtaxNotFoundError when all 10 attempts return no data', async () => {
    // API always returns empty value array
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ value: [] }),
      })
    );

    await expect(getPtax('2024-01-15')).rejects.toBeInstanceOf(PtaxNotFoundError);
  });
});
