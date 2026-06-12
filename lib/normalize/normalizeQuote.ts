import type { HistoricalPrice, PriceSource } from '@/types';
import { format } from 'date-fns';

interface QuoteRow {
  symbol: string;
  quoteDate: Date;
  priceUsd: { toNumber: () => number } | number;
  sourceApi: string;
}

export function normalizeQuote(row: QuoteRow): HistoricalPrice {
  return {
    symbol: row.symbol,
    date: format(row.quoteDate, 'yyyy-MM-dd'),
    priceUsd:
      typeof row.priceUsd === 'number'
        ? row.priceUsd
        : row.priceUsd.toNumber(),
    source: row.sourceApi as PriceSource,
  };
}
