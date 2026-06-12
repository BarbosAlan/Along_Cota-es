import { NextRequest, NextResponse } from 'next/server';
import { quotesRequestSchema } from '@/lib/validation';
import { getQuoteRange } from '@/lib/pricing/getQuoteRange';
import type { QuotesResponse } from '@/types';

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
    return NextResponse.json(response);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Erro ao buscar cotações';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
