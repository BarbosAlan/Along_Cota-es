import { NextRequest, NextResponse } from 'next/server';
import { quotesRequestSchema } from '@/lib/validation';
import { getQuoteRange } from '@/lib/pricing/getQuoteRange';
import type { QuotesResponse } from '@/types';
import { parseISO, startOfDay } from 'date-fns';

export const maxDuration = 300;

export async function POST(req: NextRequest): Promise<NextResponse> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const parsed = quotesRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'VALIDATION_ERROR', details: parsed.error.issues },
      { status: 400 }
    );
  }

  const { symbol, startDate, endDate } = parsed.data;

  try {
    const rows = await getQuoteRange(symbol, startDate, endDate);
    const response: QuotesResponse = { symbol, rows };

    // Historical quotes are immutable — cache aggressively for past periods,
    // briefly for today (data may still be updating during the day).
    const isHistorical = parseISO(endDate) < startOfDay(new Date());
    const maxAge = isHistorical ? 86_400 : 300;

    return NextResponse.json(response, {
      headers: { 'Cache-Control': `public, max-age=${maxAge}, stale-while-revalidate=${maxAge * 7}` },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Erro ao buscar cotações';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
