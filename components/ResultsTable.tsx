'use client';

import { useState, useEffect } from 'react';
import type { EnrichedTransactionRow, TransactionSummary } from '@/types';
import { BLOCKCHAIN_EXPLORERS } from '@/types';
import { format, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface ResultsTableProps {
  transactions: EnrichedTransactionRow[];
  summary: TransactionSummary;
  fromCache: boolean;
  warnings: string[];
  onRefresh?: () => void;
  isRefreshing?: boolean;
}

type TxFilter = 'all' | 'receive' | 'send' | 'fee';
1
const PAGE_SIZE = 50;

function truncateMiddle(str: string, chars = 7): string {
  if (!str || str.length <= chars * 2 + 3) return str;
  return `${str.slice(0, chars)}…${str.slice(-chars)}`;
}

function fmtUsd(v: number | null): string {
  if (v === null) return '—';
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'USD', minimumFractionDigits: 2 }).format(v);
}

function fmtBrl(v: number | null): string {
  if (v === null) return '—';
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 2 }).format(v);
}

const TYPE_CONFIG: Record<string, { label: string; dot: string; text: string; bg: string }> = {
  receive: { label: 'Entrada',    dot: 'bg-green-500',  text: 'text-green-800',  bg: 'bg-green-50' },
  send:    { label: 'Saída',      dot: 'bg-red-500',    text: 'text-red-800',    bg: 'bg-red-50' },
  swap:    { label: 'Swap',       dot: 'bg-violet-500', text: 'text-violet-800', bg: 'bg-violet-50' },
  fee:     { label: 'Taxa',       dot: 'bg-amber-500',  text: 'text-amber-800',  bg: 'bg-amber-50' },
  unknown: { label: 'Outro',      dot: 'bg-gray-400',   text: 'text-gray-600',   bg: 'bg-gray-50' },
};

function TypeBadge({ type }: { type: string }) {
  const c = TYPE_CONFIG[type] ?? TYPE_CONFIG.unknown;
  return (
    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium ${c.bg} ${c.text}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${c.dot}`} />
      {c.label}
    </span>
  );
}

const COLUMNS: [keyof EnrichedTransactionRow, string, boolean][] = [
  ['date',        'Data',        false],
  ['type',        'Tipo',        false],
  ['assetSymbol', 'Token',       false],
  ['amount',      'Quantidade',  true],
  ['priceUsd',    'Cotação USD', true],
  ['valueUsd',    'Valor USD',   true],
  ['ptax',        'PTAX',        true],
  ['valueBrl',    'Valor BRL',   true],
  ['fromAddress', 'De',          false],
  ['toAddress',   'Para',        false],
  ['txHash',      'Hash',        false],
];

export function ResultsTable({ transactions, summary, fromCache, warnings, onRefresh, isRefreshing }: ResultsTableProps) {
  const [sortField, setSortField] = useState<keyof EnrichedTransactionRow>('date');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [filter, setFilter] = useState<TxFilter>('all');
  const [page, setPage] = useState(1);
  const [warningsOpen, setWarningsOpen] = useState(false);

  // Reset to page 1 when filter or sort changes
  useEffect(() => { setPage(1); }, [filter, sortField, sortDir]);

  function toggleSort(field: keyof EnrichedTransactionRow) {
    if (sortField === field) {
      setSortDir(d => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortDir('desc');
    }
  }

  const filtered = filter === 'all'
    ? transactions
    : transactions.filter(t =>
        filter === 'receive' ? t.type === 'receive' :
        filter === 'send'    ? t.type === 'send' :
        t.type === 'fee'
      );

  const sorted = [...filtered].sort((a, b) => {
    const av = a[sortField] ?? '';
    const bv = b[sortField] ?? '';
    const cmp = String(av).localeCompare(String(bv), undefined, { numeric: true });
    return sortDir === 'asc' ? cmp : -cmp;
  });

  const totalPages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  const paginated = sorted.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  return (
    <div className="space-y-4">
      {/* Stats band */}
      <div className="bg-white rounded-lg border border-[#c2c7d1] grid grid-cols-2 md:grid-cols-5 divide-y md:divide-y-0 md:divide-x divide-[#c2c7d1]">
        {[
          { label: 'Transações', value: summary.total.toString(),        accent: false },
          { label: 'Entradas',   value: summary.totalReceived.toString(), accent: false },
          { label: 'Saídas',     value: summary.totalSent.toString(),     accent: false },
          { label: 'Total USD',  value: fmtUsd(summary.totalValueUsd),   accent: false },
          { label: 'Total BRL',  value: fmtBrl(summary.totalValueBrl),   accent: true  },
        ].map(s => (
          <div key={s.label} className={`px-5 py-4 ${s.accent ? 'bg-[#f0f6ff]' : ''}`}>
            <p className="text-[10px] font-semibold uppercase tracking-widest text-[#727780] mb-1">{s.label}</p>
            <p className={`font-bold tabular-nums font-[var(--font-jetbrains-mono)] leading-none ${s.accent ? 'text-[#0f4c81] text-2xl' : 'text-[#151c27] text-xl'}`}>
              {s.value}
            </p>
            {s.accent && (
              <p className="text-[9px] font-semibold uppercase tracking-widest text-[#0f4c81]/40 mt-1.5">via PTAX · BCB</p>
            )}
          </div>
        ))}
      </div>

      {/* Filter tabs + badges */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center border border-[#c2c7d1] rounded bg-white overflow-hidden text-sm">
          {([
            ['all',     'Todos'],
            ['receive', 'Entrada'],
            ['send',    'Saída'],
            ['fee',     'Taxa'],
          ] as [TxFilter, string][]).map(([key, label]) => (
            <button
              key={key}
              onClick={() => setFilter(key)}
              className={`px-3.5 py-1.5 font-medium transition-colors ${
                filter === key
                  ? 'bg-[#0f4c81] text-white'
                  : 'text-[#42474f] hover:bg-[#f0f3ff]'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {fromCache && (
          <span className="inline-flex items-center gap-1.5 text-xs text-[#42474f] bg-white border border-[#c2c7d1] rounded-full px-3 py-1">
            <span className="w-1.5 h-1.5 rounded-full bg-green-400" />
            Cache
          </span>
        )}

        {fromCache && onRefresh && (
          <button
            onClick={onRefresh}
            disabled={isRefreshing}
            className="inline-flex items-center gap-1.5 text-xs font-medium text-[#0f4c81] bg-white border border-[#0f4c81]/30 rounded-full px-3 py-1 hover:bg-[#f0f6ff] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <svg className={`w-3 h-3 ${isRefreshing ? 'animate-spin' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            {isRefreshing ? 'Atualizando…' : 'Atualizar dados'}
          </button>
        )}

        {warnings.length > 0 && (
          <div className="relative text-xs">
            <button
              onClick={() => setWarningsOpen(o => !o)}
              className="cursor-pointer inline-flex items-center gap-1.5 text-amber-700 bg-amber-50 border border-amber-200 rounded-full px-3 py-1"
            >
              ⚠ {warnings.length} {warnings.length === 1 ? 'aviso' : 'avisos'}
            </button>
            {warningsOpen && (
              <div className="absolute left-0 top-full mt-1 bg-white border border-[#c2c7d1] rounded-lg shadow-sm p-3 min-w-[260px] max-w-sm z-10">
                <ul className="text-xs text-[#42474f] space-y-1">
                  {warnings.map((w, i) => <li key={i}>· {w}</li>)}
                </ul>
              </div>
            )}
          </div>
        )}

        <span className="ml-auto text-xs text-[#727780]">
          {sorted.length} {sorted.length === 1 ? 'transação' : 'transações'}
        </span>
      </div>

      {/* Table */}
      <div className="bg-white rounded-lg border border-[#c2c7d1] overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-[#f0f3ff] border-b border-[#c2c7d1]">
                {COLUMNS.map(([field, label, right]) => (
                  <th
                    key={field}
                    onClick={() => toggleSort(field)}
                    className={`px-4 py-3 text-[10px] font-semibold uppercase tracking-widest text-[#42474f] cursor-pointer hover:text-[#151c27] whitespace-nowrap select-none transition-colors ${right ? 'text-right' : 'text-left'}`}
                  >
                    {label}
                    <span className={`ml-1 ${sortField === field ? 'text-[#0f4c81]' : 'text-[#c2c7d1]'}`}>
                      {sortField === field ? (sortDir === 'asc' ? '↑' : '↓') : '↕'}
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {paginated.map((tx, i) => {
                const explorerUrl = BLOCKCHAIN_EXPLORERS[tx.blockchain] + tx.txHash;
                return (
                  <tr
                    key={tx.id}
                    className={`border-b border-[#e7eefe] hover:bg-[#f0f3ff] transition-colors ${
                      i % 2 === 0 ? 'bg-white' : 'bg-[#f9f9ff]'
                    }`}
                  >
                    <td className="px-4 py-2.5 whitespace-nowrap font-[var(--font-jetbrains-mono)] text-xs text-[#151c27]">
                      {tx.date ? format(parseISO(tx.date), 'dd/MM/yyyy', { locale: ptBR }) : '—'}
                    </td>
                    <td className="px-4 py-2.5"><TypeBadge type={tx.type} /></td>
                    <td className="px-4 py-2.5 font-[var(--font-jetbrains-mono)] text-xs font-semibold text-[#151c27]">
                      {tx.assetSymbol}
                    </td>
                    <td className="px-4 py-2.5 text-right font-[var(--font-jetbrains-mono)] text-xs text-[#151c27] tabular-nums">
                      {(() => { const n = parseFloat(tx.amount); return isNaN(n) ? tx.amount : n.toLocaleString('pt-BR', { maximumFractionDigits: 8 }); })()}
                    </td>
                    <td className="px-4 py-2.5 text-right font-[var(--font-jetbrains-mono)] text-xs text-[#42474f] tabular-nums">
                      {fmtUsd(tx.priceUsd)}
                    </td>
                    <td className="px-4 py-2.5 text-right font-[var(--font-jetbrains-mono)] text-xs font-semibold text-[#151c27] tabular-nums">
                      {fmtUsd(tx.valueUsd)}
                    </td>
                    <td className="px-4 py-2.5 text-right font-[var(--font-jetbrains-mono)] text-xs text-[#42474f] tabular-nums">
                      {tx.ptax ? tx.ptax.toLocaleString('pt-BR', { minimumFractionDigits: 4 }) : '—'}
                    </td>
                    <td className="px-4 py-2.5 text-right font-[var(--font-jetbrains-mono)] text-xs font-semibold text-[#0f4c81] tabular-nums">
                      {fmtBrl(tx.valueBrl)}
                    </td>
                    <td className="px-4 py-2.5 font-[var(--font-jetbrains-mono)] text-xs text-[#727780]" title={tx.fromAddress ?? ''}>
                      {truncateMiddle(tx.fromAddress ?? '')}
                    </td>
                    <td className="px-4 py-2.5 font-[var(--font-jetbrains-mono)] text-xs text-[#727780]" title={tx.toAddress ?? ''}>
                      {truncateMiddle(tx.toAddress ?? '')}
                    </td>
                    <td className="px-4 py-2.5 font-[var(--font-jetbrains-mono)] text-xs">
                      <a href={explorerUrl} target="_blank" rel="noopener noreferrer"
                        className="text-[#0f4c81] hover:text-[#00355f] hover:underline"
                        title={tx.txHash}>
                        {truncateMiddle(tx.txHash, 5)}
                      </a>
                    </td>
                  </tr>
                );
              })}
              {paginated.length === 0 && (
                <tr>
                  <td colSpan={11} className="px-4 py-14 text-center text-[#727780] text-sm">
                    Nenhuma transação encontrada para este filtro.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-[#c2c7d1] bg-[#fafafa]">
            <span className="text-xs text-[#727780]">
              Página {page} de {totalPages} · {sorted.length} transações
            </span>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setPage(1)}
                disabled={page === 1}
                className="px-2 py-1 text-xs text-[#42474f] border border-[#c2c7d1] rounded hover:bg-[#f0f3ff] disabled:opacity-40 disabled:cursor-not-allowed"
              >
                ««
              </button>
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page === 1}
                className="px-2.5 py-1 text-xs text-[#42474f] border border-[#c2c7d1] rounded hover:bg-[#f0f3ff] disabled:opacity-40 disabled:cursor-not-allowed"
              >
                ‹ Anterior
              </button>
              <button
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className="px-2.5 py-1 text-xs text-[#42474f] border border-[#c2c7d1] rounded hover:bg-[#f0f3ff] disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Próxima ›
              </button>
              <button
                onClick={() => setPage(totalPages)}
                disabled={page === totalPages}
                className="px-2 py-1 text-xs text-[#42474f] border border-[#c2c7d1] rounded hover:bg-[#f0f3ff] disabled:opacity-40 disabled:cursor-not-allowed"
              >
                »»
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
