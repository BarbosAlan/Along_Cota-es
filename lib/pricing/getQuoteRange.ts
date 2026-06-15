import { db } from '@/lib/db';
import { getBinancePrice } from './binance';
import { getKrakenPrice } from './kraken';
import { getCoingeckoPrice } from './coingecko';
import { getPtax } from './ptax';
import { isWeekend } from '@/lib/utils/date';
import {
  eachDayOfInterval,
  parseISO,
  startOfDay,
  format,
  subDays,
} from 'date-fns';
import type { QuoteRow } from '@/types';

const CONCURRENCY = 5;

/**
 * Returns QuoteRow[] for every day in [startDate, endDate].
 *
 * Strategy:
 *  1. Bulk DB reads (prices + PTAX) — no N+1 queries
 *  2. Fetch missing PTAX first so priceBrl can be computed at insert time
 *  3. Fetch missing prices, persist with priceBrl immediately
 *  4. Resolve weekends/holidays locally from the preloaded PTAX map
 */
export async function getQuoteRange(
  symbol: string,
  startDate: string,
  endDate: string
): Promise<QuoteRow[]> {
  const upper = symbol.toUpperCase();
  const start = startOfDay(parseISO(startDate));
  const end = startOfDay(parseISO(endDate));

  const days = eachDayOfInterval({ start, end });
  const dateStrings = days.map(d => format(d, 'yyyy-MM-dd'));

  // ── 1. Bulk load cached prices ────────────────────────────────────────────
  const cachedQuotes = await db.quote.findMany({
    where: { symbol: upper, quoteDate: { gte: start, lte: end } },
    orderBy: { createdAt: 'desc' },
  });

  const priceCache = new Map<string, { priceUsd: number; priceBrl: number | null; source: string }>();
  for (const q of cachedQuotes) {
    const key = format(q.quoteDate, 'yyyy-MM-dd');
    if (!priceCache.has(key)) {
      priceCache.set(key, {
        priceUsd: Number(q.priceUsd),
        priceBrl: q.priceBrl ? Number(q.priceBrl) : null,
        source: q.sourceApi,
      });
    }
  }

  // ── 2. Bulk load PTAX (+ 7 days before start to cover weekend fallback) ──
  const ptaxLookbackStart = subDays(start, 7);
  const cachedPtax = await db.ptaxRate.findMany({
    where: { quoteDate: { gte: ptaxLookbackStart, lte: end } },
    orderBy: { quoteDate: 'asc' },
  });

  const ptaxCache = new Map<string, number>();
  for (const p of cachedPtax) {
    ptaxCache.set(format(p.quoteDate, 'yyyy-MM-dd'), Number(p.usdBrl));
  }

  // ── 3. Resolve PTAX for a date (walks back up to 10 days for weekends/holidays)
  function resolvePtax(dateStr: string): number | null {
    let d = parseISO(dateStr);
    for (let i = 0; i < 10; i++) {
      if (!isWeekend(d)) {
        const key = format(d, 'yyyy-MM-dd');
        if (ptaxCache.has(key)) return ptaxCache.get(key)!;
      }
      d = subDays(d, 1);
    }
    return null;
  }

  // ── 4. Fetch missing PTAX first (needed to compute priceBrl at persist time)
  const missingPtaxDays = dateStrings.filter(d => resolvePtax(d) === null);

  for (let i = 0; i < missingPtaxDays.length; i += CONCURRENCY) {
    const batch = missingPtaxDays.slice(i, i + CONCURRENCY);
    await Promise.all(
      batch.map(async (dateStr) => {
        try {
          const result = await getPtax(dateStr);
          ptaxCache.set(result.date, result.usdBrl);
        } catch {
          // PTAX unavailable for this date — will return null in response
        }
      })
    );
  }

  // ── 5. Fetch missing prices — priceBrl is now computable immediately ──────
  const missingPriceDays = dateStrings.filter(d => !priceCache.has(d));

  for (let i = 0; i < missingPriceDays.length; i += CONCURRENCY) {
    const batch = missingPriceDays.slice(i, i + CONCURRENCY);
    await Promise.all(
      batch.map(async (dateStr) => {
        const fetched = await fetchPriceFromApi(upper, dateStr);
        if (fetched) {
          const ptaxVal = resolvePtax(dateStr);
          const priceBrl = ptaxVal !== null ? fetched.priceUsd * ptaxVal : null;
          priceCache.set(dateStr, { ...fetched, priceBrl });
          await persistQuote(upper, startOfDay(parseISO(dateStr)), fetched.priceUsd, priceBrl, fetched.source);
        }
      })
    );
  }

  // ── 6. Patch priceBrl for cached quotes that were missing it ──────────────
  // (quotes persisted before this field existed will have priceBrl = null)
  const needsBrlPatch = dateStrings.filter(d => {
    const entry = priceCache.get(d);
    return entry && entry.priceBrl === null && resolvePtax(d) !== null;
  });

  const BRL_PATCH_CONCURRENCY = 5;
  for (let i = 0; i < needsBrlPatch.length; i += BRL_PATCH_CONCURRENCY) {
    await Promise.all(
      needsBrlPatch.slice(i, i + BRL_PATCH_CONCURRENCY).map(async dateStr => {
        const entry = priceCache.get(dateStr)!;
        const ptaxVal = resolvePtax(dateStr)!;
        const priceBrl = entry.priceUsd * ptaxVal;
        entry.priceBrl = priceBrl;
        await persistQuote(upper, startOfDay(parseISO(dateStr)), entry.priceUsd, priceBrl, entry.source);
      })
    );
  }

  // ── 7. Build response rows ────────────────────────────────────────────────
  return dateStrings.map(dateStr => {
    const price = priceCache.get(dateStr) ?? null;
    const ptaxVal = resolvePtax(dateStr);
    const priceBrl = price?.priceBrl ?? (price && ptaxVal ? price.priceUsd * ptaxVal : null);

    return {
      date: dateStr,
      symbol: upper,
      priceUsd: price?.priceUsd ?? null,
      ptax: ptaxVal,
      priceBrl,
      priceSource: price?.source ?? null,
    };
  });
}

async function fetchPriceFromApi(
  symbol: string,
  date: string
): Promise<{ priceUsd: number; source: string } | null> {
  const sourceErrors: Record<string, string> = {};

  try {
    const price = await getBinancePrice(symbol, date);
    if (price !== null) return { priceUsd: price, source: 'binance' };
  } catch (err) {
    sourceErrors.binance = err instanceof Error ? err.message : String(err);
  }

  try {
    const price = await getKrakenPrice(symbol, date);
    if (price !== null) return { priceUsd: price, source: 'kraken' };
  } catch (err) {
    sourceErrors.kraken = err instanceof Error ? err.message : String(err);
  }

  try {
    const price = await getCoingeckoPrice(symbol, date, undefined);
    if (price !== null) return { priceUsd: price, source: 'coingecko' };
  } catch (err) {
    sourceErrors.coingecko = err instanceof Error ? err.message : String(err);
  }

  if (Object.keys(sourceErrors).length > 0) {
    console.error(`[pricing] todas as fontes falharam para ${symbol} em ${date}`, sourceErrors);
  } else {
    console.warn(`[pricing] sem dados de preço para ${symbol} em ${date} (ativo pode não estar listado)`);
  }
  return null;
}

async function persistQuote(
  symbol: string,
  quoteDate: Date,
  priceUsd: number,
  priceBrl: number | null,
  sourceApi: string
): Promise<void> {
  try {
    await db.quote.upsert({
      where: { uq_quote: { symbol, quoteDate } },
      create: { symbol, quoteDate, priceUsd, priceBrl, sourceApi },
      update: { priceUsd, priceBrl, sourceApi },
    });
  } catch {
    // Non-critical — cache persistence failure does not block the response
  }
}
