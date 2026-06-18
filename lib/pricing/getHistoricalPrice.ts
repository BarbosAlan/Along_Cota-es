import { db } from '@/lib/db';
import { getOkxPrice } from './okx';
import { getKrakenPrice } from './kraken';
import { getCoingeckoPrice } from './coingecko';
import { getPtax } from './ptax';
import { normalizeQuote } from '@/lib/normalize/normalizeQuote';
import type { HistoricalPrice, PriceSource } from '@/types';
import { parseISO, startOfDay } from 'date-fns';

// BRL-pegged stablecoins: 1 token = 1 BRL. No USD price exists on exchanges.
const BRL_STABLES = new Set(['BRZ', 'BRLA']);

export async function getHistoricalPrice(
  symbol: string,
  date: string,
  assetAddress?: string
): Promise<HistoricalPrice | null> {
  const upper = symbol.toUpperCase();
  const quoteDate = startOfDay(parseISO(date));

  // BRL stablecoins: derive USD price from PTAX (1 BRL ÷ PTAX = USD)
  if (BRL_STABLES.has(upper)) {
    try {
      const ptax = await getPtax(date);
      const priceUsd = 1 / ptax.usdBrl;
      return { symbol: upper, date, priceUsd, source: 'ptax' as PriceSource };
    } catch {
      return null;
    }
  }

  // 1. DB cache — uq_quote guarantees at most one row per (symbol, quoteDate)
  const cached = await db.quote.findUnique({
    where: { uq_quote: { symbol: upper, quoteDate } },
  });

  if (cached) return normalizeQuote(cached);

  const sourceErrors: Record<string, string> = {};

  // 2. Try OKX
  try {
    const price = await getOkxPrice(upper, date);
    if (price !== null) {
      await saveQuote(upper, quoteDate, price, 'okx', date);
      return { symbol: upper, date, priceUsd: price, source: 'okx' };
    }
  } catch (err) {
    sourceErrors.okx = err instanceof Error ? err.message : String(err);
  }

  // 3. Try Kraken
  try {
    const price = await getKrakenPrice(upper, date);
    if (price !== null) {
      await saveQuote(upper, quoteDate, price, 'kraken', date);
      return { symbol: upper, date, priceUsd: price, source: 'kraken' };
    }
  } catch (err) {
    sourceErrors.kraken = err instanceof Error ? err.message : String(err);
  }

  // 4. Fallback to CoinGecko
  try {
    const price = await getCoingeckoPrice(upper, date, assetAddress);
    if (price !== null) {
      await saveQuote(upper, quoteDate, price, 'coingecko', date);
      return { symbol: upper, date, priceUsd: price, source: 'coingecko' };
    }
  } catch (err) {
    sourceErrors.coingecko = err instanceof Error ? err.message : String(err);
  }

  if (Object.keys(sourceErrors).length > 0) {
    console.error(`[pricing] todas as fontes falharam para ${upper} em ${date}`, sourceErrors);
  } else {
    console.warn(`[pricing] sem dados de preço para ${upper} em ${date} (ativo pode não estar listado)`);
  }
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
