import { db } from '@/lib/db';
import { getAdapter } from '@/lib/blockchain';
import { getHistoricalPrice } from '@/lib/pricing/getHistoricalPrice';
import { getPtax } from '@/lib/pricing/ptax';
import { normalizeTransaction } from '@/lib/normalize/normalizeTransaction';
import type {
  BlockchainId,
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

    // Pre-fetch all unique PTAX dates sequentially — avoids race condition where
    // multiple concurrent Promise.all callbacks all pass the `has()` guard simultaneously
    // and then overwrite each other, potentially replacing a good value with null.
    const uniqueDates = [...new Set([...priceLookups.values()].map(l => l.date))];
    for (const d of uniqueDates) {
      try {
        const ptax = await getPtax(d);
        ptaxResults.set(d, { usdBrl: ptax.usdBrl });
      } catch (ptaxErr) {
        console.error(`[PTAX] failed for ${d}:`, ptaxErr);
        ptaxResults.set(d, null);
      }
    }

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
        })
      );
    }

    if (warnings.length > 0) {
      console.warn(`[pricing] ${warnings.length} cotações não encontradas:`, warnings.join(', '));
    }

    // ── Build all enriched records in memory (no DB calls) ──────────────────
    const enrichedRecords = txList.map(tx => {
      const dateKey = format(tx.date, 'yyyy-MM-dd');
      const priceKey = `${tx.assetSymbol}:${dateKey}`;
      const priceData = priceResults.get(priceKey);
      const ptaxData  = ptaxResults.get(dateKey);

      const priceUsd = priceData?.priceUsd ?? null;
      const amountNum = parseFloat(tx.amount);
      const valueUsd = priceUsd !== null ? amountNum * priceUsd : null;
      const ptax     = ptaxData?.usdBrl ?? null;
      const valueBrl = valueUsd !== null && ptax !== null ? valueUsd * ptax : null;

      return {
        blockchain,
        walletAddress: wallet,
        txHash:       tx.txHash,
        date:         tx.date,
        type:         tx.type,
        assetSymbol:  tx.assetSymbol,
        assetAddress: tx.assetAddress ?? null,
        amount:       tx.amount,
        fromAddress:  tx.fromAddress ?? null,
        toAddress:    tx.toAddress   ?? null,
        priceUsd,
        valueUsd,
        ptax,
        valueBrl,
        sourceApi: tx.sourceApi,
      };
    });

    // ── 1 query to find which tx hashes already exist ────────────────────
    const existingHashes = new Set(
      (await db.transaction.findMany({
        where: {
          blockchain,
          walletAddress: wallet,
          txHash: { in: enrichedRecords.map(r => r.txHash) },
        },
        select: { txHash: true },
      })).map(r => r.txHash)
    );

    const toCreate = enrichedRecords.filter(r => !existingHashes.has(r.txHash));
    const toUpdate = enrichedRecords.filter(r =>  existingHashes.has(r.txHash));

    // ── 1 DB call for all new transactions ───────────────────────────────
    if (toCreate.length > 0) {
      await db.transaction.createMany({ data: toCreate, skipDuplicates: true });
    }

    // ── Parallel batched updates for existing transactions ───────────────
    const UPDATE_BATCH = 20;
    for (let i = 0; i < toUpdate.length; i += UPDATE_BATCH) {
      await Promise.all(
        toUpdate.slice(i, i + UPDATE_BATCH).map(r =>
          db.transaction.update({
            where: { uq_transaction: { blockchain, txHash: r.txHash, walletAddress: wallet } },
            data: { priceUsd: r.priceUsd, valueUsd: r.valueUsd, ptax: r.ptax, valueBrl: r.valueBrl },
          })
        )
      );
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