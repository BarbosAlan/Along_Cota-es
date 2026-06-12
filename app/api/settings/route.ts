import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

export async function GET(): Promise<NextResponse> {
  const [ptaxCount, quotesCount, txCount, logCount] = await Promise.all([
    db.ptaxRate.count(),
    db.quote.count(),
    db.transaction.count(),
    db.searchLog.count(),
  ]);

  return NextResponse.json({
    apiKeys: {
      etherscan: !!process.env.ETHERSCAN_API_KEY,
      helius:    !!process.env.HELIUS_API_KEY,
      coingecko: !!process.env.COINGECKO_API_KEY,
      trongrid:  !!process.env.TRONGRID_API_KEY,
    },
    caches: {
      ptax:        ptaxCount,
      quotes:      quotesCount,
      transactions: txCount,
      searchLogs:  logCount,
    },
  });
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  let body: { action?: string };
  try { body = await req.json(); } catch { body = {}; }

  const { action } = body;

  if (action === 'clear_ptax') {
    const { count } = await db.ptaxRate.deleteMany({});
    return NextResponse.json({ deleted: count });
  }

  if (action === 'clear_quotes') {
    const { count } = await db.quote.deleteMany({});
    return NextResponse.json({ deleted: count });
  }

  if (action === 'clear_transactions') {
    await db.searchLog.deleteMany({});
    const { count } = await db.transaction.deleteMany({});
    return NextResponse.json({ deleted: count });
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
}
