import { withRetry, fetchWithTimeout } from '@/lib/errors';
import { parseISO, startOfDay } from 'date-fns';

const BASE_URL = 'https://api.kraken.com/0/public/OHLC';

// Kraken uses XBT for Bitcoin and LUNA2 for Terra 2.0
const KRAKEN_SYMBOL: Record<string, string> = {
  BTC: 'XBT',
  LUNA: 'LUNA2', // Kraken lists Terra Classic as LUNA and Terra 2.0 as LUNA2
};

// Stablecoins — always 1 USD
const STABLES = new Set(['USDT', 'USDC', 'BUSD', 'DAI', 'TUSD', 'USDP', 'GUSD']);

// [time, open, high, low, close, vwap, volume, count]
type KrakenCandle = [number, string, string, string, string, string, string, number];

interface KrakenResponse {
  error: string[];
  result: Record<string, KrakenCandle[] | number>; // "last" key is a number
}

async function fetchDayClose(symbol: string, date: string): Promise<number | null> {
  const krakenTicker = KRAKEN_SYMBOL[symbol] ?? symbol;
  const dayStart = startOfDay(parseISO(date));
  const since = Math.floor(dayStart.getTime() / 1000);

  const url = new URL(BASE_URL);
  url.searchParams.set('pair', `${krakenTicker}USD`);
  url.searchParams.set('interval', '1440'); // daily candles
  url.searchParams.set('since', (since - 86400).toString()); // 1 day back as safety margin

  const res = await fetchWithTimeout(url.toString(), { next: { revalidate: 0 } });
  if (!res.ok) return null;

  const data: KrakenResponse = await res.json();
  if (data.error?.length) return null;

  // The result key is the normalised pair name Kraken chose (e.g. "XXBTZUSD")
  const pairKey = Object.keys(data.result).find(k => k !== 'last');
  if (!pairKey) return null;

  const candles = data.result[pairKey] as KrakenCandle[];
  if (!candles?.length) return null;

  // Find the candle whose open time matches the target day (UTC midnight)
  const target = candles.find(c => c[0] === since);

  // Fall back to the closest candle before or at the target (last one before since+86400)
  const candle =
    target ??
    candles.filter(c => c[0] <= since + 86399).at(-1);

  if (!candle) return null;

  const close = parseFloat(candle[4]);
  return isNaN(close) ? null : close;
}

export async function getKrakenPrice(symbol: string, date: string): Promise<number | null> {
  const upper = symbol.toUpperCase();
  if (STABLES.has(upper)) return 1.0;

  try {
    return await withRetry(() => fetchDayClose(upper, date), 3, 800);
  } catch {
    return null;
  }
}
