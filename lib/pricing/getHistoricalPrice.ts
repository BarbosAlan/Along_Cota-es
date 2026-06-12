import { db } from '@/lib/db';
import { getBinancePrice } from './binance';
import { getKrakenPrice } from './kraken';
import { getCoingeckoPrice } from './coingecko';
import { getPtax } from './ptax';
import { normalizeQuote } from '@/lib/normalize/normalizeQuote';
import type { HistoricalPrice } from '@/types';
import { parseISO, startOfDay } from 'date-fns';

export async function getHistoricalPrice(
  symbol: string,
  date: string,
  assetAddress?: string
): Promise<HistoricalPrice | null> {
  const upper = symbol.toUpperCase();
  const quoteDate = startOfDay(parseISO(date));

  // 1. DB cache
  const cached = await db.quote.findFirst({
    where: { symbol: upper, quoteDate },
    orderBy: { createdAt: 'desc' },
  });

  if (cached) return normalizeQuote(cached);

  // 2. Try Binance
  try {
    const price = await getBinancePrice(upper, date);
    if (price !== null) {
      await saveQuote(upper, quoteDate, price, 'binance', date);
      return { symbol: upper, date, priceUsd: price, source: 'binance' };
    }
  } catch { /* fall through */ }

  // 3. Try Kraken
  try {
    const price = await getKrakenPrice(upper, date);
    if (price !== null) {
      await saveQuote(upper, quoteDate, price, 'kraken', date);
      return { symbol: upper, date, priceUsd: price, source: 'kraken' };
    }
  } catch { /* fall through */ }

  // 4. Fallback to CoinGecko
  try {
    const price = await getCoingeckoPrice(upper, date, assetAddress);
    if (price !== null) {
      await saveQuote(upper, quoteDate, price, 'coingecko', date);
      return { symbol: upper, date, priceUsd: price, source: 'coingecko' };
    }
  } catch { /* no data */ }

  return null;
}

async function saveQuote(
  symbol: string,
  quoteDate: Date,
  priceUsd: number,
  sourceApi: string,
  dateStr: string
): Promise<void> {
  let priceBrl: number | null = null;
  try {
    const ptax = await getPtax(dateStr);
    priceBrl = priceUsd * ptax.usdBrl;
  } catch { /* PTAX unavailable — persist without BRL */ }

  try {
    await db.quote.upsert({
      where: { uq_quote: { symbol, quoteDate } },
      create: { symbol, quoteDate, priceUsd, priceBrl, sourceApi },
      update: { priceUsd, priceBrl, sourceApi },
    });
  } catch {
    // Non-critical: cache save failure should not block the response
  }
}
