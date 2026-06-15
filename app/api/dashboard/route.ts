import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { format } from 'date-fns';

export const runtime = 'nodejs';

export async function GET(): Promise<NextResponse> {
  try {
    const [
      txAgg,
      txByBlockchain,
      txByType,
      walletRows,
      quoteCount,
      quoteSymbols,
      quotesBySource,
      ptaxCount,
      latestPtax,
      recentSearches,
    ] = await Promise.all([
      db.transaction.aggregate({
        _count: { id: true },
        _sum: { valueBrl: true, valueUsd: true },
      }),
      db.transaction.groupBy({
        by: ['blockchain'],
        _count: { id: true },
        orderBy: { _count: { id: 'desc' } },
      }),
      db.transaction.groupBy({
        by: ['type'],
        _count: { id: true },
      }),
      db.transaction.findMany({
        select: { walletAddress: true },
        distinct: ['walletAddress'],
      }),
      db.quote.count(),
      db.quote.findMany({
        select: { symbol: true },
        distinct: ['symbol'],
      }),
      db.quote.groupBy({
        by: ['sourceApi'],
        _count: { id: true },
        orderBy: { _count: { id: 'desc' } },
      }),
      db.ptaxRate.count(),
      db.ptaxRate.findFirst({ orderBy: { quoteDate: 'desc' } }),
      db.searchLog.findMany({
        take: 8,
        orderBy: { createdAt: 'desc' },
      }),
    ]);

    const typeMap = Object.fromEntries(txByType.map(t => [t.type, t._count.id]));

    return NextResponse.json({
      transactions: {
        total: txAgg._count.id,
        received: typeMap['receive'] ?? 0,
        sent: typeMap['send'] ?? 0,
        totalValueBrl: txAgg._sum.valueBrl ? Number(txAgg._sum.valueBrl) : null,
        totalValueUsd: txAgg._sum.valueUsd ? Number(txAgg._sum.valueUsd) : null,
        byBlockchain: txByBlockchain.map(b => ({
          blockchain: b.blockchain,
          count: b._count.id,
        })),
      },
      wallets: { total: walletRows.length },
      quotes: {
        total: quoteCount,
        uniqueSymbols: quoteSymbols.length,
        bySource: quotesBySource.map(s => ({ source: s.sourceApi, count: s._count.id })),
      },
      ptax: {
        latest: latestPtax ? Number(latestPtax.usdBrl) : null,
        date: latestPtax ? format(latestPtax.quoteDate, 'yyyy-MM-dd') : null,
        totalCached: ptaxCount,
      },
      recentSearches: recentSearches.map(s => ({
        id: s.id,
        blockchain: s.blockchain,
        walletAddress: s.walletAddress,
        totalTransactions: s.totalTransactions,
        status: s.status,
        createdAt: s.createdAt.toISOString(),
      })),
    });
  } catch {
    return NextResponse.json({ error: 'Failed to load dashboard data' }, { status: 500 });
  }
}
