import { describe, it, expect, vi, afterEach } from 'vitest';
import { getCoingeckoPrice } from '@/lib/pricing/coingecko';

// Bypass the rate limiter — its behavior is tested in ratelimit.test.ts
vi.mock('@/lib/ratelimit', () => ({
  checkRateLimit: vi.fn().mockResolvedValue({ allowed: true, remaining: 25, resetAt: 9_999_999_999_999, limit: 25 }),
  isUpstashEnabled: false,
  RULES: {},
}));

const DATE = '2024-01-15';
const CG_DATE = '15-01-2024'; // CoinGecko format

function makeJsonResponse(data: object, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(data),
  };
}

function priceResponse(usd: number) {
  return makeJsonResponse({ market_data: { current_price: { usd } } });
}

function stubFetch(...responses: object[]) {
  const mock = vi.fn();
  for (const res of responses) {
    mock.mockResolvedValueOnce(res);
  }
  vi.stubGlobal('fetch', mock);
  return mock;
}

afterEach(() => vi.unstubAllGlobals());

describe('getCoingeckoPrice — stablecoins', () => {
  it.each(['USDT', 'USDC', 'BUSD', 'DAI', 'TUSD'])(
    'returns 1.0 for %s without any fetch',
    async (symbol) => {
      const fetchMock = stubFetch(); // no responses needed
      const price = await getCoingeckoPrice(symbol, DATE);
      expect(price).toBe(1.0);
      expect(fetchMock).not.toHaveBeenCalled();
    }
  );

  it('is case-insensitive for stablecoins', async () => {
    stubFetch();
    expect(await getCoingeckoPrice('usdt', DATE)).toBe(1.0);
    expect(await getCoingeckoPrice('Usdc', DATE)).toBe(1.0);
  });
});

describe('getCoingeckoPrice — known symbols (SYMBOL_TO_ID map)', () => {
  it('resolves BTC via hardcoded ID and returns the USD price', async () => {
    const fetchMock = stubFetch(priceResponse(42000));

    const price = await getCoingeckoPrice('BTC', DATE);

    expect(price).toBe(42000);
    const url = fetchMock.mock.calls[0][0] as string;
    expect(url).toContain('/coins/bitcoin/history');
    expect(url).toContain(`date=${CG_DATE}`);
  });

  it('is case-insensitive for the symbol', async () => {
    stubFetch(priceResponse(42000));
    const price = await getCoingeckoPrice('btc', DATE);
    expect(price).toBe(42000);
  });

  it('returns null when market_data is absent from the response', async () => {
    stubFetch(makeJsonResponse({})); // no market_data
    const price = await getCoingeckoPrice('ETH', DATE);
    expect(price).toBeNull();
  });

  it('returns null on HTTP 404 (coin not found for this date)', async () => {
    stubFetch(makeJsonResponse({}, 404));
    const price = await getCoingeckoPrice('BTC', DATE);
    expect(price).toBeNull();
  });

  it('returns null on HTTP 400 (data unavailable / pre-launch)', async () => {
    stubFetch(makeJsonResponse({}, 400));
    const price = await getCoingeckoPrice('BTC', DATE);
    expect(price).toBeNull();
  });

  it('throws PricingApiError on HTTP 500', async () => {
    stubFetch({ ok: false, status: 500, json: () => Promise.resolve({}) });
    await expect(getCoingeckoPrice('BTC', DATE)).rejects.toThrow();
  });
});

describe('getCoingeckoPrice — unknown symbol with contract address', () => {
  it('looks up the coin ID via contract address on Ethereum first', async () => {
    const fetchMock = stubFetch(
      makeJsonResponse({ id: 'usd-coin' }),   // contract lookup on ethereum succeeds
      priceResponse(1.0),                     // history for found ID
    );

    const price = await getCoingeckoPrice('UNKNOWN', DATE, '0xcontract123');

    expect(price).toBe(1.0);
    const contractUrl = fetchMock.mock.calls[0][0] as string;
    expect(contractUrl).toContain('/coins/ethereum/contract/0xcontract123');
  });

  it('falls through to the next platform if the first returns non-ok', async () => {
    const fetchMock = stubFetch(
      { ok: false, status: 404, json: () => Promise.resolve({}) }, // ethereum fails
      makeJsonResponse({ id: 'my-token' }),                        // polygon-pos succeeds
      priceResponse(5.0),                                          // history
    );

    const price = await getCoingeckoPrice('MYTOKEN', DATE, '0xcontract456');

    expect(price).toBe(5.0);
    const polygonUrl = fetchMock.mock.calls[1][0] as string;
    expect(polygonUrl).toContain('/coins/polygon-pos/contract/');
  });
});

describe('getCoingeckoPrice — unknown symbol, no contract address (search fallback)', () => {
  it('searches by symbol and uses the matched coin ID', async () => {
    const fetchMock = stubFetch(
      makeJsonResponse({ coins: [{ id: 'my-new-coin', symbol: 'MNC' }] }), // /search
      priceResponse(7.5),                                                   // history
    );

    const price = await getCoingeckoPrice('MNC', DATE);

    expect(price).toBe(7.5);
    const searchUrl = fetchMock.mock.calls[0][0] as string;
    expect(searchUrl).toContain('/search?query=MNC');
  });

  it('returns null when symbol is not found in search results', async () => {
    stubFetch(
      makeJsonResponse({ coins: [] }),   // no results
    );

    const price = await getCoingeckoPrice('ZZZUNKNOWN', DATE);
    expect(price).toBeNull();
  });

  it('returns null when search symbol does not exactly match', async () => {
    stubFetch(
      makeJsonResponse({ coins: [{ id: 'other-coin', symbol: 'ZZZOTHER' }] }),
    );

    const price = await getCoingeckoPrice('ZZZUNKNOWN', DATE);
    expect(price).toBeNull();
  });

  it('returns null when search request fails', async () => {
    stubFetch({ ok: false, status: 503, json: () => Promise.resolve({}) });
    const price = await getCoingeckoPrice('BADTOKEN', DATE);
    expect(price).toBeNull();
  });
});
