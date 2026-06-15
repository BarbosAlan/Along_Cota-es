import { describe, it, expect, vi, afterEach } from 'vitest';
import { getKrakenPrice } from '@/lib/pricing/kraken';

afterEach(() => vi.unstubAllGlobals());

// [time, open, high, low, close, vwap, volume, count]
type KrakenCandle = [number, string, string, string, string, string, string, number];

function krakenResponse(pair: string, candles: KrakenCandle[]) {
  return {
    error: [],
    result: { [pair]: candles, last: 999999 },
  };
}

function stubFetch(body: unknown) {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve(body),
    })
  );
}

const JAN15_UTC = Math.floor(new Date('2024-01-15T00:00:00Z').getTime() / 1000);

function candle(time: number, close: string): KrakenCandle {
  return [time, '41000', '43000', '40500', close, '41750', '500', 200];
}

describe('getKrakenPrice — stablecoins', () => {
  it.each(['USDT', 'USDC', 'BUSD', 'DAI', 'TUSD', 'USDP', 'GUSD'])(
    'returns 1.0 for %s without fetching',
    async (symbol) => {
      const fetchSpy = vi.fn();
      vi.stubGlobal('fetch', fetchSpy);
      expect(await getKrakenPrice(symbol, '2024-01-15')).toBe(1.0);
      expect(fetchSpy).not.toHaveBeenCalled();
    }
  );
});

describe('getKrakenPrice — successful fetches', () => {
  it('returns the close price of the matching candle', async () => {
    stubFetch(krakenResponse('XXBTZUSD', [candle(JAN15_UTC, '42500.50')]));
    expect(await getKrakenPrice('BTC', '2024-01-15')).toBeCloseTo(42500.5);
  });

  it('falls back to the last candle before end of day when exact match missing', async () => {
    // One candle from 1 day earlier — should be used as fallback
    stubFetch(krakenResponse('ETHUSD', [candle(JAN15_UTC - 86400, '2200.00')]));
    const price = await getKrakenPrice('ETH', '2024-01-15');
    expect(price).toBeCloseTo(2200.0);
  });

  it('is case-insensitive for the symbol', async () => {
    stubFetch(krakenResponse('ETHUSD', [candle(JAN15_UTC, '1800.00')]));
    expect(await getKrakenPrice('eth', '2024-01-15')).toBeCloseTo(1800.0);
  });
});

describe('getKrakenPrice — symbol aliases', () => {
  it('requests XBTUSD for BTC', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ error: [], result: { last: 0 } }),
    });
    vi.stubGlobal('fetch', fetchMock);

    await getKrakenPrice('BTC', '2024-01-15');

    const calledUrl = String(fetchMock.mock.calls[0][0]);
    expect(calledUrl).toContain('XBTUSD');
    expect(calledUrl).not.toContain('BTCUSD');
  });
});

describe('getKrakenPrice — error / empty cases', () => {
  it('returns null when HTTP response is not ok', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: false, status: 500, json: () => Promise.resolve({}) })
    );
    expect(await getKrakenPrice('ETH', '2024-01-15')).toBeNull();
  });

  it('returns null when no candles are returned', async () => {
    stubFetch(krakenResponse('ETHUSD', []));
    expect(await getKrakenPrice('ETH', '2024-01-15')).toBeNull();
  });

  it('returns null when API returns an error message', async () => {
    stubFetch({ error: ['EService:Unavailable'], result: {} });
    expect(await getKrakenPrice('ETH', '2024-01-15')).toBeNull();
  });
});
