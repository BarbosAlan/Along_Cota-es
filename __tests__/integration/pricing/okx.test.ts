import { describe, it, expect, vi, afterEach } from 'vitest';
import { getOkxPrice } from '@/lib/pricing/okx';

afterEach(() => vi.unstubAllGlobals());

// 2024-01-15 00:00:00 UTC in ms
const DAY_START = 1705276800000;

function okxResponse(close: string) {
  return {
    code: '0',
    msg: '',
    data: [[DAY_START.toString(), '41000', '43000', '40500', close, '1000', '42500500', '42500500', '1']],
  };
}

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

describe('getOkxPrice — stablecoins', () => {
  it.each(['USDT', 'USDC', 'BUSD', 'DAI', 'TUSD', 'USDP', 'GUSD'])(
    'returns 1.0 for %s without making any HTTP call',
    async (symbol) => {
      const fetchSpy = vi.fn();
      vi.stubGlobal('fetch', fetchSpy);
      expect(await getOkxPrice(symbol, '2024-01-15')).toBe(1.0);
      expect(fetchSpy).not.toHaveBeenCalled();
    }
  );

  it('is case-insensitive for stablecoins', async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    expect(await getOkxPrice('usdc', '2024-01-15')).toBe(1.0);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe('getOkxPrice — successful fetches', () => {
  it('returns the close price from candle data', async () => {
    stubFetch(200, okxResponse('42500.50'));
    expect(await getOkxPrice('BTC', '2024-01-15')).toBe(42500.5);
  });

  it('is case-insensitive for the symbol', async () => {
    stubFetch(200, okxResponse('1800.00'));
    expect(await getOkxPrice('eth', '2024-01-15')).toBe(1800.0);
  });

  it('requests BTC-USDT instId for BTC', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve(okxResponse('42500')),
      text: () => Promise.resolve(''),
    });
    vi.stubGlobal('fetch', fetchMock);

    await getOkxPrice('BTC', '2024-01-15');

    const calledUrl = String(fetchMock.mock.calls[0][0]);
    expect(calledUrl).toContain('instId=BTC-USDT');
    expect(calledUrl).toContain('bar=1D');
  });
});

describe('getOkxPrice — null cases', () => {
  it('returns null when data array is empty', async () => {
    stubFetch(200, { code: '0', msg: '', data: [] });
    expect(await getOkxPrice('BTC', '2024-01-15')).toBeNull();
  });

  it('returns null when instrument does not exist (code 51001)', async () => {
    stubFetch(200, { code: '51001', msg: 'Instrument ID does not exist', data: [] });
    expect(await getOkxPrice('UNKNOWNXYZ', '2024-01-15')).toBeNull();
  });

  it('returns null when candle timestamp is outside the requested day', async () => {
    const wrongDayTs = (DAY_START + 86400000).toString(); // next day
    stubFetch(200, {
      code: '0',
      msg: '',
      data: [[wrongDayTs, '41000', '43000', '40500', '42000', '1000', '42000000', '42000000', '1']],
    });
    expect(await getOkxPrice('BTC', '2024-01-15')).toBeNull();
  });

  it('returns null on HTTP error (does not throw)', async () => {
    stubFetch(503, 'Service Unavailable');
    expect(await getOkxPrice('BTC', '2024-01-15')).toBeNull();
  });
});
