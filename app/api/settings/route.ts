import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

export async function GET(): Promise<NextResponse> {
  try {
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
        ptax:         ptaxCount,
        quotes:       quotesCount,
        transactions: txCount,
        searchLogs:   logCount,
      },
    });
  } catch {
    return NextResponse.json({ error: 'DATABASE_ERROR' }, { status: 503 });
  }
}

const VALID_ACTIONS = ['clear_ptax', 'clear_quotes', 'clear_transactions'] as const;
type SettingsAction = typeof VALID_ACTIONS[number];

export async function POST(req: NextRequest): Promise<NextResponse> {
  const secret = process.env.ADMIN_SECRET;
  const auth = req.headers.get('authorization');
  if (secret && auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 });
  }

  let body: { action?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { action } = body;
  if (!action || !VALID_ACTIONS.includes(action as SettingsAction)) {
    return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
  }

  try {
    if (action === 'clear_ptax') {
      const { count } = await db.ptaxRate.deleteMany({});
      return NextResponse.json({ deleted: count });
    }

    if (action === 'clear_quotes') {
      const { count } = await db.quote.deleteMany({});
      return NextResponse.json({ deleted: count });
    }

    // clear_transactions
    await db.searchLog.deleteMany({});
    const { count } = await db.transaction.deleteMany({});
    return NextResponse.json({ deleted: count });
  } catch {
    return NextResponse.json({ error: 'DATABASE_ERROR' }, { status: 503 });
  }
}
