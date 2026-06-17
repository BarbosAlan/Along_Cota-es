import { NextRequest, NextResponse } from 'next/server';

export const maxDuration = 30;

// Debug endpoint — test Binance API access from Vercel's serverless environment
export async function GET(req: NextRequest): Promise<NextResponse> {
  const secret = req.nextUrl.searchParams.get('secret');
  if (!process.env.ADMIN_SECRET || secret !== process.env.ADMIN_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const symbol = req.nextUrl.searchParams.get('symbol') ?? 'LUNAUSDT';
  const date = req.nextUrl.searchParams.get('date') ?? '2024-01-01';

  const { parseISO, startOfDay, endOfDay } = await import('date-fns');
  const start = startOfDay(parseISO(date)).getTime();
  const end = endOfDay(parseISO(date)).getTime();

  const url = new URL('https://api.binance.com/api/v3/klines');
  url.searchParams.set('symbol', symbol.toUpperCase());
  url.searchParams.set('interval', '1d');
  url.searchParams.set('startTime', start.toString());
  url.searchParams.set('endTime', end.toString());
  url.searchParams.set('limit', '1');

  try {
    const res = await fetch(url.toString(), { cache: 'no-store' });
    const body = await res.text();
    return NextResponse.json({
      status: res.status,
      ok: res.ok,
      headers: Object.fromEntries(res.headers.entries()),
      body: body.slice(0, 500),
    });
  } catch (err) {
    return NextResponse.json({
      error: err instanceof Error ? err.message : String(err),
    });
  }
}
