import { PricingApiError, withRetry, fetchWithTimeout } from '@/lib/errors';
import { parseISO, startOfDay, endOfDay } from 'date-fns';

const BASE_URL = 'https://api.binance.com/api/v3/klines';

// USDT only — BUSD was delisted from Binance in December 2023
const QUOTE_ASSETS = ['USDT'];

async function fetchKline(
  baseSymbol: string,
  quoteAsset: string,
  date: string
): Promise<number | null> {
  const start = startOfDay(parseISO(date)).getTime();
  const end = endOfDay(parseISO(date)).getTime();

  const url = new URL(BASE_URL);
  url.searchParams.set('symbol', `${baseSymbol.toUpperCase()}${quoteAsset}`);
  url.searchParams.set('interval', '1d');
  url.searchParams.set('startTime', start.toString());
  url.searchParams.set('endTime', end.toString());
  url.searchParams.set('limit', '1');

  const res = await fetchWithTimeout(url.toString(), { next: { revalidate: 0 } });

  if (res.status === 400) {
    const body = await res.text().catch(() => '');
    console.warn(`[binance] HTTP 400 for ${baseSymbol}${quoteAsset} on ${date}: ${body.slice(0, 200)}`);
    return null;
  }

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new PricingApiError('binance', `HTTP ${res.status}: ${body.slice(0, 200)}`);
  }

  const data: [string, string, string, string, string][] = await res.json();
  if (!data.length) return null;

  // Index 4 = close price
  const closePrice = parseFloat(data[0][4]);
  return isNaN(closePrice) ? null : closePrice;
}

// Symbols that trade under a different ticker on Binance.
// Note: Binance.com is geo-blocked from Vercel's US servers (HTTP 451).
// Historical data for blocked symbols must be pre-seeded via scripts/seed-*.mjs.
const BINANCE_ALIAS: Record<string, string> = {};

export async function getBinancePrice(
  symbol: string,
  date: string
): Promise<number | null> {
  const upper = symbol.toUpperCase();

  // Skip stable coins — they are always 1 USD
  if (['USDT', 'USDC', 'BUSD', 'DAI', 'TUSD', 'USDP', 'GUSD'].includes(upper)) {
    return 1.0;
  }

  const ticker = BINANCE_ALIAS[upper] ?? upper;

  for (const quote of QUOTE_ASSETS) {
    try {
      const price = await withRetry(() => fetchKline(ticker, quote, date), 3, 500);
      if (price !== null) return price;
      console.warn(`[binance] ${ticker}${quote} on ${date}: returned null (pair may not exist or geo-blocked)`);
    } catch (err) {
      console.error(`[binance] ${ticker}${quote} on ${date}:`, err instanceof Error ? err.message : err);
    }
  }

  return null;
}
