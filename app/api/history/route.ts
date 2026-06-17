import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

export const runtime = 'nodejs';
export const maxDuration = 30;

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

export async function GET(req: NextRequest): Promise<NextResponse> {
  const secret = process.env.ADMIN_SECRET;
  const auth = req.headers.get('authorization');
  if (secret && auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 });
  }

  const { searchParams } = req.nextUrl;
  const limit = Math.min(Math.max(1, parseInt(searchParams.get('limit') ?? '') || DEFAULT_LIMIT), MAX_LIMIT);
  const offset = Math.max(0, parseInt(searchParams.get('offset') ?? '') || 0);

  try {
    const [logs, total] = await Promise.all([
      db.searchLog.findMany({
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: offset,
      }),
      db.searchLog.count(),
    ]);
    return NextResponse.json({ logs, total, limit, offset });
  } catch {
    return NextResponse.json({ error: 'DATABASE_ERROR' }, { status: 503 });
  }
}
