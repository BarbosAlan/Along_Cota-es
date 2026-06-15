import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { batchRequestSchema } from '@/lib/validation';
import {
  fetchAndEnrichTransactions,
  getTransactionsFromDbMulti,
  buildSummary,
  checkCacheExistsForChains,
} from '@/lib/transactions';
import { detectBlockchains, normalizeAddress } from '@/lib/utils/address';
import type { BlockchainId, BatchWalletResult, BatchResponse, TransactionSummary } from '@/types';
import { startOfDay, endOfDay, parseISO } from 'date-fns';

export const maxDuration = 300;

const EMPTY_SUMMARY: TransactionSummary = {
  total: 0,
  totalReceived: 0,
  totalSent: 0,
  totalValueUsd: null,
  totalValueBrl: null,
};

async function processWallet(
  address: string,
  startDate: string,
  endDate: string,
  forceRefresh: boolean,
): Promise<BatchWalletResult> {
  const chains = detectBlockchains(address) as BlockchainId[];

  if (chains.length === 0) {
    return {
      address,
      chains: [],
      status: 'error',
      transactions: [],
      summary: EMPTY_SUMMARY,
      fromCache: false,
      warnings: [],
      error: 'Formato de endereço não reconhecido',
    };
  }

  const fromCache =
    !forceRefresh && (await checkCacheExistsForChains(chains, address, startDate, endDate));

  if (fromCache) {
    const transactions = await getTransactionsFromDbMulti(chains, address, startDate, endDate);
    const summary = buildSummary(transactions);
    return { address, chains, status: 'success', transactions, summary, fromCache: true, warnings: [] };
  }

  const fetchResults = await Promise.allSettled(
    chains.map(async (chain) => {
      const searchLog = await db.searchLog.create({
        data: {
          blockchain: chain,
          walletAddress: normalizeAddress(address, chain),
          startDate: startOfDay(parseISO(startDate)),
          endDate: endOfDay(parseISO(endDate)),
          status: 'pending',
        },
      });
      await fetchAndEnrichTransactions(chain, address, startDate, endDate, searchLog.id);
    }),
  );

  const warnings: string[] = [];
  for (let i = 0; i < fetchResults.length; i++) {
    if (fetchResults[i].status === 'rejected') {
      const r = fetchResults[i] as PromiseRejectedResult;
      const msg = r.reason instanceof Error ? r.reason.message : 'Erro desconhecido';
      warnings.push(`Erro ao buscar ${chains[i]}: ${msg}`);
    }
  }

  if (fetchResults.every(r => r.status === 'rejected')) {
    return {
      address,
      chains,
      status: 'error',
      transactions: [],
      summary: EMPTY_SUMMARY,
      fromCache: false,
      warnings,
      error: warnings.join('; '),
    };
  }

  const transactions = await getTransactionsFromDbMulti(chains, address, startDate, endDate);
  const summary = buildSummary(transactions);
  return { address, chains, status: 'success', transactions, summary, fromCache: false, warnings };
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const parsed = batchRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'VALIDATION_ERROR', details: parsed.error.issues },
      { status: 400 },
    );
  }

  const { addresses, startDate, endDate, forceRefresh } = parsed.data;

  const WALLET_CONCURRENCY = 5;
  const settled: PromiseSettledResult<BatchWalletResult>[] = [];
  for (let i = 0; i < addresses.length; i += WALLET_CONCURRENCY) {
    const batch = await Promise.allSettled(
      addresses.slice(i, i + WALLET_CONCURRENCY).map(addr =>
        processWallet(addr, startDate, endDate, forceRefresh ?? false)
      )
    );
    settled.push(...batch);
  }

  const results: BatchWalletResult[] = settled.map((r, i) => {
    if (r.status === 'fulfilled') return r.value;
    return {
      address: addresses[i],
      chains: [],
      status: 'error',
      transactions: [],
      summary: EMPTY_SUMMARY,
      fromCache: false,
      warnings: [],
      error: r.reason instanceof Error ? r.reason.message : 'Erro desconhecido',
    };
  });

  const successes = results.filter(r => r.status === 'success');

  const combined: BatchResponse['combined'] = {
    totalAddresses: results.length,
    successCount: successes.length,
    errorCount: results.filter(r => r.status === 'error').length,
    totalTransactions: successes.reduce((s, r) => s + r.summary.total, 0),
    totalValueBrl: successes.some(r => r.summary.totalValueBrl !== null)
      ? successes.reduce((s, r) => s + (r.summary.totalValueBrl ?? 0), 0)
      : null,
    totalValueUsd: successes.some(r => r.summary.totalValueUsd !== null)
      ? successes.reduce((s, r) => s + (r.summary.totalValueUsd ?? 0), 0)
      : null,
  };

  const response: BatchResponse = { results, combined };
  return NextResponse.json(response);
}
