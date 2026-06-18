import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { searchRequestSchema } from '@/lib/validation';
import {
  fetchAndEnrichTransactions,
  getTransactionsFromDbMulti,
  buildSummary,
  getCachedChains,
} from '@/lib/transactions';
import { detectBlockchains, normalizeAddress } from '@/lib/utils/address';
import type { BlockchainId, SearchResponse } from '@/types';
import { startOfDay, endOfDay, parseISO } from 'date-fns';

export const maxDuration = 300;

export async function POST(req: NextRequest): Promise<NextResponse> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const parsed = searchRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'VALIDATION_ERROR', details: parsed.error.issues },
      { status: 400 }
    );
  }

  const { walletAddress, startDate, endDate, forceRefresh, blockchain } = parsed.data;

  // Use the specified blockchain, or auto-detect from address format
  const chains: BlockchainId[] = blockchain
    ? [blockchain]
    : (detectBlockchains(walletAddress) as BlockchainId[]);
  if (chains.length === 0) {
    return NextResponse.json(
      {
        error: 'UNKNOWN_ADDRESS_FORMAT',
        message:
          'Formato de endereço não reconhecido. Verifique se o endereço está correto e tente novamente.',
      },
      { status: 400 }
    );
  }

  // Per-chain cache check: only fetch chains that have no cached result
  const cachedChains = forceRefresh
    ? []
    : await getCachedChains(chains, walletAddress, startDate, endDate);

  const cachedSet = new Set(cachedChains);
  const chainsToFetch = chains.filter(c => !cachedSet.has(c));
  const fromCache = chainsToFetch.length === 0;

  if (fromCache) {
    const transactions = await getTransactionsFromDbMulti(chains, walletAddress, startDate, endDate);
    const summary = buildSummary(transactions);
    const log = await db.searchLog.findFirst({
      where: { blockchain: { in: chains }, walletAddress: normalizeAddress(walletAddress, chains[0]), status: 'success' },
      orderBy: { createdAt: 'desc' },
    });
    const response: SearchResponse = {
      searchLogId: log?.id ?? '',
      transactions,
      summary,
      fromCache: true,
      warnings: [],
    };
    return NextResponse.json(response);
  }

  // Fetch only chains without cache, in parallel; tolerate partial failures
  const fetchResults = await Promise.allSettled(
    chainsToFetch.map(async (chain) => {
      const normalizedWallet = normalizeAddress(walletAddress, chain);
      const start = startOfDay(parseISO(startDate));
      const end = endOfDay(parseISO(endDate));
      const searchLog = await db.searchLog.upsert({
        where: {
          uq_search_log: {
            blockchain: chain,
            walletAddress: normalizedWallet,
            startDate: start,
            endDate: end,
          },
        },
        create: {
          blockchain: chain,
          walletAddress: normalizedWallet,
          startDate: start,
          endDate: end,
          status: 'pending',
        },
        update: { status: 'pending', errorMessage: null },
      });
      await fetchAndEnrichTransactions(chain, walletAddress, startDate, endDate, searchLog.id);
      return searchLog.id;
    })
  );

  const warnings: string[] = [];
  let firstLogId = '';

  for (let i = 0; i < fetchResults.length; i++) {
    const result = fetchResults[i];
    if (result.status === 'fulfilled') {
      if (!firstLogId) firstLogId = result.value;
    } else {
      const msg = result.reason instanceof Error ? result.reason.message : 'Erro desconhecido';
      warnings.push(`Erro ao buscar ${chainsToFetch[i]}: ${msg}`);
    }
  }

  // If every chain failed, return error
  if (fetchResults.every(r => r.status === 'rejected')) {
    return NextResponse.json(
      { error: 'BLOCKCHAIN_API_ERROR', message: warnings.join('; '), retryable: true },
      { status: 502 }
    );
  }

  const transactions = await getTransactionsFromDbMulti(chains, walletAddress, startDate, endDate);
  const summary = buildSummary(transactions);

  const response: SearchResponse = {
    searchLogId: firstLogId,
    transactions,
    summary,
    fromCache: false,
    warnings,
  };
  return NextResponse.json(response);
}
