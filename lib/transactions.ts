import { db } from '@/lib/db';
import { getAdapter } from '@/lib/blockchain';
import { getHistoricalPrice } from '@/lib/pricing/getHistoricalPrice';
import { getPtax } from '@/lib/pricing/ptax';
import { normalizeTransaction } from '@/lib/normalize/normalizeTransaction';
import type {
  BlockchainId,
  SearchResponse,
  EnrichedTransactionRow,
  TransactionSummary,
} from '@/types';
import { format, startOfDay, endOfDay, parseISO } from 'date-fns';
import { normalizeAddress } from '@/lib/utils/address';

export async function fetchAndEnrichTransactions(
  blockchain: BlockchainId,
  walletAddress: string,
  startDate: string,
  endDate: string,
  searchLogId: string
): Promise<void> {
  const start = startOfDay(parseISO(startDate));
  const end = endOfDay(parseISO(endDate));
  const wallet = normalizeAddress(walletAddress, blockchain);

  try {
    // Fetch raw transactions from blockchain API
    const adapter = getAdapter(blockchain);
    const rawTxs = await adapter.getTransactions(wallet, start, end, blockchain);

    // Normalize
    const normalized = rawTxs.map(tx =>
      normalizeTransaction(tx, blockchain, wallet)
    );

    // Deduplicate by (blockchain, txHash, walletAddress)
    const uniqueTxs = new Map<string, typeof normalized[0]>();
    for (const tx of normalized) {
      const key = `${blockchain}:${tx.txHash}:${wallet}`;
      if (!uniqueTxs.has(key)) uniqueTxs.set(key, tx);
    }

    const txList = [...uniqueTxs.values()];

    // Collect unique (symbol, date) pairs for batch price lookup
    const priceLookups = new Map<string, { symbol: string; date: string; assetAddress?: string }>();
    for (const tx of txList) {
      const dateKey = format(tx.date, 'yyyy-MM-dd');
      const lookupKey = `${tx.assetSymbol}:${dateKey}`;
      if (!priceLookups.has(lookupKey)) {
        priceLookups.set(lookupKey, {
          symbol: tx.assetSymbol,
          date: dateKey,
          assetAddress: tx.assetAddress,
        });
      }
    }

    // Fetch all prices (parallelized with concurrency limit)
    const priceResults = new Map<string, { priceUsd: number; source: string } | null>();
    const ptaxResults = new Map<string, { usdBrl: number } | null>();
    const warnings: string[] = [];

    const CONCURRENCY = 5;
    const lookupList = [...priceLookups.entries()];

    for (let i = 0; i < lookupList.length; i += CONCURRENCY) {
      const batch = lookupList.slice(i, i + CONCURRENCY);
      await Promise.all(
        batch.map(async ([key, lookup]) => {
          const price = await getHistoricalPrice(
            lookup.symbol,
            lookup.date,
            lookup.assetAddress
          );
          priceResults.set(key, price ? { priceUsd: price.priceUsd, source: price.source } : null);

          if (!price) {
            warnings.push(`Cotação não encontrada para ${lookup.symbol} em ${lookup.date}`);
          }

          // Fetch PTAX for this date
          if (!ptaxResults.has(lookup.date)) {
            try {
              const ptax = await getPtax(lookup.date);
              ptaxResults.set(lookup.date, { usdBrl: ptax.usdBrl });
            } catch (ptaxErr) {
              console.error(`[PTAX] failed for ${lookup.date}:`, ptaxErr);
              ptaxResults.set(lookup.date, null);
            }
          }
        })
      );
    }

    // Upsert all transactions with enrichment
    for (const tx of txList) {
      const dateKey = format(tx.date, 'yyyy-MM-dd');
      const priceKey = `${tx.assetSymbol}:${dateKey}`;
      const priceData = priceResults.get(priceKey);
      const ptaxData = ptaxResults.get(dateKey);

      const priceUsd = priceData?.priceUsd ?? null;
      const amountNum = parseFloat(tx.amount);
      const valueUsd = priceUsd !== null ? amountNum * priceUsd : null;
      const ptax = ptaxData?.usdBrl ?? null;
      const valueBrl = valueUsd !== null && ptax !== null ? valueUsd * ptax : null;

      await db.transaction.upsert({
        where: {
          uq_transaction: {
            blockchain,
            txHash: tx.txHash,
            walletAddress: wallet,
          },
        },
        create: {
          blockchain,
          walletAddress: wallet,
          txHash: tx.txHash,
          date: tx.date,
          type: tx.type,
          assetSymbol: tx.assetSymbol,
          assetAddress: tx.assetAddress ?? null,
          amount: tx.amount,
          fromAddress: tx.fromAddress ?? null,
          toAddress: tx.toAddress ?? null,
          priceUsd: priceUsd ?? null,
          valueUsd: valueUsd ?? null,
          ptax: ptax ?? null,
          valueBrl: valueBrl ?? null,
          sourceApi: tx.sourceApi,
        },
        update: {
          priceUsd: priceUsd ?? null,
          valueUsd: valueUsd ?? null,
          ptax: ptax ?? null,
          valueBrl: valueBrl ?? null,
        },
      });
    }

    // Update search log as success
    await db.searchLog.update({
      where: { id: searchLogId },
      data: {
        status: 'success',
        totalTransactions: txList.length,
      },
    });
  } catch (err) {
    await db.searchLog.update({
      where: { id: searchLogId },
      data: {
        status: 'error',
        errorMessage: err instanceof Error ? err.message : 'Unknown error',
      },
    });
    throw err;
  }
}

export async function getTransactionsFromDb(
  blockchain: BlockchainId,
  walletAddress: string,
  startDate: string,
  endDate: string
): Promise<EnrichedTransactionRow[]> {
  const wallet = normalizeAddress(walletAddress, blockchain);
  const start = startOfDay(parseISO(startDate));
  const end = endOfDay(parseISO(endDate));

  const rows = await db.transaction.findMany({
    where: {
      blockchain,
      walletAddress: wallet,
      date: { gte: start, lte: end },
    },
    orderBy: { date: 'desc' },
  });

  return rows.map(row => ({
    id: row.id,
    txHash: row.txHash,
    date: format(row.date, 'yyyy-MM-dd'),
    type: row.type as EnrichedTransactionRow['type'],
    assetSymbol: row.assetSymbol,
    amount: row.amount.toString(),
    priceUsd: row.priceUsd ? Number(row.priceUsd) : null,
    valueUsd: row.valueUsd ? Number(row.valueUsd) : null,
    ptax: row.ptax ? Number(row.ptax) : null,
    valueBrl: row.valueBrl ? Number(row.valueBrl) : null,
    fromAddress: row.fromAddress,
    toAddress: row.toAddress,
    sourceApi: row.sourceApi,
    blockchain: row.blockchain as BlockchainId,
  }));
}

export function buildSummary(transactions: EnrichedTransactionRow[]): TransactionSummary {
  const received = transactions.filter(t => t.type === 'receive');
  const sent = transactions.filter(t => t.type === 'send');

  const totalValueUsd = transactions.some(t => t.valueUsd !== null)
    ? transactions.reduce((sum, t) => sum + (t.valueUsd ?? 0), 0)
    : null;

  const totalValueBrl = transactions.some(t => t.valueBrl !== null)
    ? transactions.reduce((sum, t) => sum + (t.valueBrl ?? 0), 0)
    : null;

  return {
    total: transactions.length,
    totalReceived: received.length,
    totalSent: sent.length,
    totalValueUsd,
    totalValueBrl,
  };
}

export async function checkCacheExists(
  blockchain: BlockchainId,
  walletAddress: string,
  startDate: string,
  endDate: string
): Promise<boolean> {
  return checkCacheExistsForChains([blockchain], walletAddress, startDate, endDate);
}

export async function checkCacheExistsForChains(
  blockchains: BlockchainId[],
  walletAddress: string,
  startDate: string,
  endDate: string
): Promise<boolean> {
  const wallet = normalizeAddress(walletAddress, blockchains[0]);
  const start = startOfDay(parseISO(startDate));
  const end = endOfDay(parseISO(endDate));

  const logs = await db.searchLog.findMany({
    where: {
      blockchain: { in: blockchains },
      walletAddress: wallet,
      startDate: start,
      endDate: end,
      status: 'success',
    },
    select: { blockchain: true },
  });

  const found = new Set(logs.map(l => l.blockchain));
  return blockchains.every(bc => found.has(bc));
}

export async function getTransactionsFromDbMulti(
  blockchains: BlockchainId[],
  walletAddress: string,
  startDate: string,
  endDate: string
): Promise<EnrichedTransactionRow[]> {
  const wallet = normalizeAddress(walletAddress, blockchains[0]);
  const start = startOfDay(parseISO(startDate));
  const end = endOfDay(parseISO(endDate));

  const rows = await db.transaction.findMany({
    where: {
      blockchain: { in: blockchains },
      walletAddress: wallet,
      date: { gte: start, lte: end },
    },
    orderBy: { date: 'desc' },
  });

  return rows.map(row => ({
    id: row.id,
    txHash: row.txHash,
    date: format(row.date, 'yyyy-MM-dd'),
    type: row.type as EnrichedTransactionRow['type'],
    assetSymbol: row.assetSymbol,
    amount: row.amount.toString(),
    priceUsd: row.priceUsd ? Number(row.priceUsd) : null,
    valueUsd: row.valueUsd ? Number(row.valueUsd) : null,
    ptax: row.ptax ? Number(row.ptax) : null,
    valueBrl: row.valueBrl ? Number(row.valueBrl) : null,
    fromAddress: row.fromAddress,
    toAddress: row.toAddress,
    sourceApi: row.sourceApi,
    blockchain: row.blockchain as BlockchainId,
  }));
}
