import ExcelJS from 'exceljs';
import { format, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import type { EnrichedTransactionRow, QuoteRow } from '@/types';

const HEADERS = [
  { key: 'date', header: 'Data', width: 16 },
  { key: 'type', header: 'Tipo', width: 12 },
  { key: 'assetSymbol', header: 'Moeda/Token', width: 14 },
  { key: 'amount', header: 'Quantidade', width: 22 },
  { key: 'priceUsd', header: 'Cotação USD', width: 16 },
  { key: 'valueUsd', header: 'Valor USD', width: 18 },
  { key: 'ptax', header: 'PTAX', width: 12 },
  { key: 'valueBrl', header: 'Valor BRL', width: 18 },
  { key: 'fromAddress', header: 'De', width: 46 },
  { key: 'toAddress', header: 'Para', width: 46 },
  { key: 'txHash', header: 'Hash', width: 70 },
  { key: 'blockchain', header: 'Blockchain', width: 14 },
  { key: 'sourceApi', header: 'Fonte', width: 14 },
];

function formatType(type: string): string {
  const map: Record<string, string> = {
    receive: 'Recebimento',
    send: 'Envio',
    swap: 'Swap',
    fee: 'Taxa',
    unknown: 'Desconhecido',
  };
  return map[type] ?? type;
}

export async function generateExcel(
  transactions: EnrichedTransactionRow[],
  walletAddress: string
): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Sistema de Cotações';
  workbook.created = new Date();

  // ── Transactions sheet ─────────────────────────────────────────────────────
  const sheet = workbook.addWorksheet('Transações', {
    views: [{ state: 'frozen', ySplit: 1 }],
  });

  sheet.columns = HEADERS.map(h => ({
    header: h.header,
    key: h.key,
    width: h.width,
  }));

  // Style header row
  const headerRow = sheet.getRow(1);
  headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  headerRow.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FF1E3A5F' },
  };
  headerRow.alignment = { vertical: 'middle', horizontal: 'center' };
  headerRow.height = 22;

  // Add data rows
  for (const tx of transactions) {
    const row = sheet.addRow({
      date: tx.date ? format(parseISO(tx.date), 'dd/MM/yyyy', { locale: ptBR }) : '',
      type: formatType(tx.type),
      assetSymbol: tx.assetSymbol,
      amount: tx.amount,
      priceUsd: tx.priceUsd ?? null,
      valueUsd: tx.valueUsd ?? null,
      ptax: tx.ptax ?? null,
      valueBrl: tx.valueBrl ?? null,
      fromAddress: tx.fromAddress ?? '',
      toAddress: tx.toAddress ?? '',
      txHash: tx.txHash,
      blockchain: tx.blockchain,
      sourceApi: tx.sourceApi,
    });

    // Format numeric cells
    const priceCell = row.getCell('priceUsd');
    const valueUsdCell = row.getCell('valueUsd');
    const ptaxCell = row.getCell('ptax');
    const valueBrlCell = row.getCell('valueBrl');

    if (priceCell.value !== null) priceCell.numFmt = '$#,##0.000000';
    if (valueUsdCell.value !== null) valueUsdCell.numFmt = '$#,##0.00';
    if (ptaxCell.value !== null) ptaxCell.numFmt = '#,##0.0000';
    if (valueBrlCell.value !== null) valueBrlCell.numFmt = 'R$\\ #,##0.00';

    // Zebra striping
    if (row.number % 2 === 0) {
      row.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFF5F7FA' },
      };
    }
  }

  // ── Summary sheet ──────────────────────────────────────────────────────────
  const summary = workbook.addWorksheet('Resumo');
  const totalTxs = transactions.length;
  const received = transactions.filter(t => t.type === 'receive');
  const sent = transactions.filter(t => t.type === 'send');
  const totalUsd = transactions.reduce((s, t) => s + (t.valueUsd ?? 0), 0);
  const totalBrl = transactions.reduce((s, t) => s + (t.valueBrl ?? 0), 0);

  const rows = [
    ['Carteira', walletAddress],
    ['Data de exportação', format(new Date(), 'dd/MM/yyyy HH:mm', { locale: ptBR })],
    ['', ''],
    ['Total de transações', totalTxs],
    ['Transações recebidas', received.length],
    ['Transações enviadas', sent.length],
    ['Total em USD', totalUsd],
    ['Total em BRL', totalBrl],
  ];

  for (const [label, value] of rows) {
    const r = summary.addRow([label, value]);
    r.getCell(1).font = { bold: true };
    if (typeof value === 'number' && (label as string).includes('USD')) {
      r.getCell(2).numFmt = '$#,##0.00';
    }
    if (typeof value === 'number' && (label as string).includes('BRL')) {
      r.getCell(2).numFmt = 'R$\\ #,##0.00';
    }
  }

  summary.getColumn(1).width = 30;
  summary.getColumn(2).width = 50;

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}

export function generateCsv(transactions: EnrichedTransactionRow[]): string {
  const headers = HEADERS.map(h => h.header).join(',');
  const rows = transactions.map(tx => [
    tx.date ? format(parseISO(tx.date), 'dd/MM/yyyy') : '',
    formatType(tx.type),
    tx.assetSymbol,
    tx.amount,
    tx.priceUsd ?? '',
    tx.valueUsd ?? '',
    tx.ptax ?? '',
    tx.valueBrl ?? '',
    tx.fromAddress ?? '',
    tx.toAddress ?? '',
    tx.txHash,
    tx.blockchain,
    tx.sourceApi,
  ]
    .map(v => `"${String(v).replace(/"/g, '""')}"`)
    .join(','));

  return [headers, ...rows].join('\n');
}

const QUOTES_HEADERS = [
  { key: 'date',        header: 'Data',        width: 14 },
  { key: 'symbol',      header: 'Moeda',       width: 10 },
  { key: 'priceUsd',    header: 'Preço USD',   width: 18 },
  { key: 'ptax',        header: 'PTAX',        width: 12 },
  { key: 'priceBrl',    header: 'Preço BRL',   width: 18 },
  { key: 'priceSource', header: 'Fonte',       width: 14 },
];

export async function generateQuotesExcel(
  quotes: QuoteRow[],
  symbol: string
): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Sistema de Cotações';
  workbook.created = new Date();

  const sheet = workbook.addWorksheet(`Cotações ${symbol}`, {
    views: [{ state: 'frozen', ySplit: 1 }],
  });

  sheet.columns = QUOTES_HEADERS.map(h => ({ header: h.header, key: h.key, width: h.width }));

  const headerRow = sheet.getRow(1);
  headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E3A5F' } };
  headerRow.alignment = { vertical: 'middle', horizontal: 'center' };
  headerRow.height = 22;

  for (const q of quotes) {
    const row = sheet.addRow({
      date: q.date ? format(parseISO(q.date), 'dd/MM/yyyy', { locale: ptBR }) : '',
      symbol: q.symbol,
      priceUsd: q.priceUsd ?? null,
      ptax: q.ptax ?? null,
      priceBrl: q.priceBrl ?? null,
      priceSource: q.priceSource ?? '',
    });

    if (row.getCell('priceUsd').value !== null) row.getCell('priceUsd').numFmt = '$#,##0.000000';
    if (row.getCell('ptax').value !== null)     row.getCell('ptax').numFmt = '#,##0.0000';
    if (row.getCell('priceBrl').value !== null)  row.getCell('priceBrl').numFmt = 'R$\\ #,##0.000000';

    if (row.number % 2 === 0) {
      row.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF5F7FA' } };
    }
  }

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}

export function generateQuotesCsv(quotes: QuoteRow[]): string {
  const headers = QUOTES_HEADERS.map(h => h.header).join(',');
  const rows = quotes.map(q =>
    [
      q.date ? format(parseISO(q.date), 'dd/MM/yyyy') : '',
      q.symbol,
      q.priceUsd ?? '',
      q.ptax ?? '',
      q.priceBrl ?? '',
      q.priceSource ?? '',
    ]
      .map(v => `"${String(v).replace(/"/g, '""')}"`)
      .join(',')
  );
  return [headers, ...rows].join('\n');
}
