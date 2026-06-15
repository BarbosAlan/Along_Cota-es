import { NextResponse } from 'next/server';
import { db } from '@/lib/db';

export async function GET(): Promise<NextResponse> {
  try {
    const logs = await db.searchLog.findMany({
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    return NextResponse.json({ logs });
  } catch {
    return NextResponse.json({ error: 'DATABASE_ERROR' }, { status: 503 });
  }
}
