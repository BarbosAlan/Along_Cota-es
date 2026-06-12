import { PricingApiError, withRetry, fetchWithTimeout } from '@/lib/errors';
import { parseISO, startOfDay, endOfDay } from 'date-fns';

const BASE_URL = 'https://api.binance.com/api/v3/klines';

// Pairs to try in order: USDT first, then BUSD, then BTC-derived
const QUOTE_ASSETS = ['USDT', 'BUSD'];

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

  // Binance returns 400 for invalid pairs
  if (res.status === 400) return null;

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new PricingApiError('binance', `HTTP ${res.status}: ${body}`);
  }

  const data: [string, string, string, string, string][] = await res.json();
  if (!data.length) return null;

  // Index 4 = close price
  const closePrice = parseFloat(data[0][4]);
  return isNaN(closePrice) ? null : closePrice;
}

// Symbols that trade under a different ticker on Binance
const BINANCE_ALIAS: Record<string, string> = {
  LUNA: 'LUNA2', // Terra 2.0 listed as LUNA2 on Binance
};

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
    } catch {
      // Try next quote asset
    }
  }

  return null;
}
