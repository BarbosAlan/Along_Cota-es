import { NextResponse } from 'next/server';
import { db } from '@/lib/db';

export async function GET(): Promise<NextResponse> {
  let dbStatus: 'connected' | 'error' = 'connected';

  try {
    await db.$queryRaw`SELECT 1`;
  } catch {
    dbStatus = 'error';
  }

  return NextResponse.json({
    status: dbStatus === 'connected' ? 'ok' : 'degraded',
    db: dbStatus,
    timestamp: new Date().toISOString(),
  });
}
