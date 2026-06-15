import { PricingApiError, fetchWithTimeout } from '@/lib/errors';
import { parseISO, format } from 'date-fns';

const BASE_URL = 'https://api.coingecko.com/api/v3';
const PRO_BASE_URL = 'https://pro-api.coingecko.com/api/v3';

// Hardcoded map for top assets (symbol → coingecko id)
const SYMBOL_TO_ID: Record<string, string> = {
  BTC: 'bitcoin',
  ETH: 'ethereum',
  BNB: 'binancecoin',
  SOL: 'solana',
  ADA: 'cardano',
  XRP: 'ripple',
  DOT: 'polkadot',
  DOGE: 'dogecoin',
  AVAX: 'avalanche-2',
  MATIC: 'matic-network',
  POL: 'matic-network',
  LINK: 'chainlink',
  UNI: 'uniswap',
  ATOM: 'cosmos',
  LTC: 'litecoin',
  ETC: 'ethereum-classic',
  XLM: 'stellar',
  TRX: 'tron',
  LUNA: 'terra-luna-2',
  LUNC: 'terra-luna',
  LSK: 'lisk',
  USDT: 'tether',
  USDC: 'usd-coin',
  DAI: 'dai',
  BUSD: 'binance-usd',
  SHIB: 'shiba-inu',
  NEAR: 'near',
  FTM: 'fantom',
  ALGO: 'algorand',
  VET: 'vechain',
  MANA: 'decentraland',
  SAND: 'the-sandbox',
  AXS: 'axie-infinity',
  AAVE: 'aave',
  MKR: 'maker',
  COMP: 'compound-governance-token',
  SNX: 'havven',
  CRV: 'curve-dao-token',
  '1INCH': '1inch',
};

// Token bucket for rate limiting (30 req/min free tier).
// Uses a promise chain to serialize acquisitions and prevent the race
// where multiple concurrent waiters each independently reset the counter.
let tokens = 30;
let lastRefill = Date.now();
let acquiring: Promise<void> = Promise.resolve();

async function acquireToken(): Promise<void> {
  const prev = acquiring;
  let release!: () => void;
  acquiring = new Promise<void>(r => { release = r; });
  await prev;

  const now = Date.now();
  const elapsed = now - lastRefill;
  if (elapsed >= 60_000) {
    tokens = 30;
    lastRefill = now;
  }
  if (tokens <= 0) {
    const wait = 60_000 - (Date.now() - lastRefill);
    await new Promise(r => setTimeout(r, Math.max(0, wait)));
    tokens = 30;
    lastRefill = Date.now();
  }
  tokens--;
  release();
}

function getBaseUrl(): string {
  return process.env.COINGECKO_API_KEY ? PRO_BASE_URL : BASE_URL;
}

function getHeaders(): HeadersInit {
  const key = process.env.COINGECKO_API_KEY;
  return key ? { 'x-cg-pro-api-key': key } : {};
}

async function resolveCoingeckoId(symbol: string): Promise<string | null> {
  const upper = symbol.toUpperCase();
  if (SYMBOL_TO_ID[upper]) return SYMBOL_TO_ID[upper];

  // Use /search instead of the full 60k-entry coins/list — faster, ranked by relevance
  await acquireToken();
  const res = await fetchWithTimeout(
    `${getBaseUrl()}/search?query=${encodeURIComponent(upper)}`,
    { headers: getHeaders(), next: { revalidate: 3600 } },
  );
  if (!res.ok) return null;

  const data: { coins: { id: string; symbol: string }[] } = await res.json();
  // Exact symbol match, first result is ranked highest by CoinGecko
  const match = data.coins.find(c => c.symbol.toUpperCase() === upper);
  return match?.id ?? null;
}

export async function getCoingeckoPrice(
  symbol: string,
  date: string,
  assetAddress?: string
): Promise<number | null> {
  const upper = symbol.toUpperCase();

  // Stable coins
  if (['USDT', 'USDC', 'BUSD', 'DAI', 'TUSD'].includes(upper)) return 1.0;

  try {
    await acquireToken();

    // Format date as DD-MM-YYYY (CoinGecko requirement)
    const cgDate = format(parseISO(date), 'dd-MM-yyyy');

    let coinId: string | undefined = SYMBOL_TO_ID[upper];
    if (!coinId && assetAddress) {
      // Try to find by contract address on known platforms
      const platforms = ['ethereum', 'polygon-pos', 'binance-smart-chain', 'solana'];
      for (const platform of platforms) {
        await acquireToken();
        const contractRes = await fetchWithTimeout(
          `${getBaseUrl()}/coins/${platform}/contract/${assetAddress}`,
          { headers: getHeaders(), next: { revalidate: 3600 } }
        );
        if (contractRes.ok) {
          const data: { id: string } = await contractRes.json();
          coinId = data.id;
          break;
        }
      }
    }

    if (!coinId) {
      coinId = (await resolveCoingeckoId(symbol)) ?? undefined;
    }

    if (!coinId) return null;

    await acquireToken();
    const res = await fetchWithTimeout(
      `${getBaseUrl()}/coins/${coinId}/history?date=${cgDate}&localization=false`,
      { headers: getHeaders(), next: { revalidate: 0 } }
    );

    // 404 = coin not found; 400 = data unavailable for this date (too recent, pre-launch, etc.)
    if (res.status === 404 || res.status === 400) return null;
    if (!res.ok) {
      throw new PricingApiError('coingecko', `HTTP ${res.status}`);
    }

    const data: { market_data?: { current_price?: { usd?: number } } } = await res.json();
    return data.market_data?.current_price?.usd ?? null;
  } catch (err) {
    if (err instanceof PricingApiError) throw err;
    return null;
  }
}
