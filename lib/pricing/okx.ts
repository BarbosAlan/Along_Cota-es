import { PricingApiError, withRetry, fetchWithTimeout } from '@/lib/errors';

const BASE_URL = 'https://www.okx.com/api/v5/market/history-candles';

const STABLES = new Set(['USDT', 'USDC', 'BUSD', 'DAI', 'TUSD', 'USDP', 'GUSD']);

// Override map for symbols whose OKX base ticker differs from the canonical symbol.
const OKX_ALIAS: Record<string, string> = {};

interface OkxResponse {
  code: string;
  msg: string;
  data: string[][];
}

async function fetchCandle(instId: string, date: string): Promise<number | null> {
  // Use UTC midnight — OKX candle timestamps are always UTC
  const dayStart = new Date(date + 'T00:00:00Z').getTime();
  // OKX `after` = exclusive upper bound; returns candles with ts < after (newest first)
  const after = (dayStart + 86400000).toString();

  const url = new URL(BASE_URL);
  url.searchParams.set('instId', instId);
  url.searchParams.set('bar', '1D');
  url.searchParams.set('after', after);
  url.searchParams.set('limit', '1');

  const res = await fetchWithTimeout(url.toString(), { next: { revalidate: 0 } });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new PricingApiError('okx', `HTTP ${res.status}: ${body.slice(0, 200)}`);
  }

  const json: OkxResponse = await res.json();

  if (json.code !== '0') {
    if (json.code === '51001') return null; // instrument doesn't exist
    throw new PricingApiError('okx', `code ${json.code}: ${json.msg}`);
  }

  if (!json.data?.length) return null;

  // Verify the candle belongs to the requested day
  const candleTs = parseInt(json.data[0][0], 10);
  if (candleTs < dayStart || candleTs >= dayStart + 86400000) return null;

  const close = parseFloat(json.data[0][4]);
  return isNaN(close) ? null : close;
}

export async function getOkxPrice(symbol: string, date: string): Promise<number | null> {
  const upper = symbol.toUpperCase();

  if (STABLES.has(upper)) return 1.0;

  const base = OKX_ALIAS[upper] ?? upper;
  const instId = `${base}-USDT`;

  try {
    const price = await withRetry(() => fetchCandle(instId, date), 3, 500);
    if (price === null) console.warn(`[okx] ${instId} on ${date}: no data`);
    return price;
  } catch (err) {
    console.error(`[okx] ${instId} on ${date}:`, err instanceof Error ? err.message : err);
    return null;
  }
}
