import { describe, it, expect, vi, afterEach } from 'vitest';
import { getBinancePrice } from '@/lib/pricing/binance';

afterEach(() => vi.unstubAllGlobals());

function stubFetch(status: number, body: unknown) {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({
      ok: status >= 200 && status < 300,
      status,
      json: () => Promise.resolve(body),
      text: () => Promise.resolve(typeof body === 'string' ? body : JSON.stringify(body)),
    })
  );
}

// Binance kline tuple: [openTime, open, high, low, close, ...]
function kline(close: string) {
  return [['1705363200000', '41000', '43000', '40500', close, '1000', '1705449600000']];
}

describe('getBinancePrice — stablecoins', () => {
  it.each(['USDT', 'USDC', 'BUSD', 'DAI', 'TUSD', 'USDP', 'GUSD'])(
    'returns 1.0 for %s without making any HTTP call',
    async (symbol) => {
      const fetchSpy = vi.fn();
      vi.stubGlobal('fetch', fetchSpy);
      expect(await getBinancePrice(symbol, '2024-01-15')).toBe(1.0);
      expect(fetchSpy).not.toHaveBeenCalled();
    }
  );

  it('is case-insensitive for stablecoins', async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    expect(await getBinancePrice('usdc', '2024-01-15')).toBe(1.0);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe('getBinancePrice — successful fetches', () => {
  it('returns the close price from kline data', async () => {
    stubFetch(200, kline('42500.50'));
    expect(await getBinancePrice('BTC', '2024-01-15')).toBe(42500.5);
  });

  it('is case-insensitive for the symbol', async () => {
    stubFetch(200, kline('1800.00'));
    expect(await getBinancePrice('eth', '2024-01-15')).toBe(1800.0);
  });
});

describe('getBinancePrice — null cases', () => {
  it('returns null when Binance responds with 400 (unknown pair)', async () => {
    stubFetch(400, { code: -1121, msg: 'Invalid symbol' });
    expect(await getBinancePrice('UNKNOWNXYZ', '2024-01-15')).toBeNull();
  });

  it('returns null when kline array is empty', async () => {
    stubFetch(200, []);
    expect(await getBinancePrice('BTC', '2024-01-15')).toBeNull();
  });
});

describe('getBinancePrice — symbol aliases', () => {
  it('requests LUNA2USDT when symbol is LUNA', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve(kline('0.55')),
      text: () => Promise.resolve(''),
    });
    vi.stubGlobal('fetch', fetchMock);

    await getBinancePrice('LUNA', '2024-01-15');

    const calledUrl = String(fetchMock.mock.calls[0][0]);
    expect(calledUrl).toContain('LUNA2USDT');
    expect(calledUrl).not.toContain('LUNAUSDT');
  });
});
