'use client';

import { useState } from 'react';
import type { EnrichedTransactionRow, QuoteRow } from '@/types';

interface TransactionsExportProps {
  kind: 'transactions';
  transactions: EnrichedTransactionRow[];
  walletAddress: string;
  format: 'xlsx' | 'csv';
  label: string;
  variant?: 'light' | 'dark';
}

interface QuotesExportProps {
  kind: 'quotes';
  quotes: QuoteRow[];
  symbol: string;
  format: 'xlsx' | 'csv';
  label: string;
  variant?: 'light' | 'dark';
}

type ExportButtonProps = TransactionsExportProps | QuotesExportProps;

export function ExportButton(props: ExportButtonProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  async function handleExport() {
    setIsLoading(true);
    setExportError(null);
    try {
      const body =
        props.kind === 'quotes'
          ? JSON.stringify({ quotes: props.quotes, symbol: props.symbol, format: props.format })
          : JSON.stringify({ transactions: props.transactions, format: props.format, walletAddress: props.walletAddress });

      const res = await fetch('/api/export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
      });

      if (!res.ok) throw new Error('Falha ao gerar exportação');

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download =
        res.headers.get('content-disposition')?.match(/filename="(.+)"/)?.[1] ??
        `export.${props.format}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      setExportError(err instanceof Error ? err.message : 'Erro ao exportar');
    } finally {
      setIsLoading(false);
    }
  }

  const empty =
    props.kind === 'quotes' ? props.quotes.length === 0 : props.transactions.length === 0;

  return (
    <div className="flex flex-col items-start gap-0.5">
      <button
        onClick={handleExport}
        disabled={isLoading || empty}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded border border-[#c2c7d1] bg-white hover:bg-[#f0f3ff] hover:border-[#0f4c81] text-[#42474f] hover:text-[#0f4c81] text-xs font-semibold transition-colors disabled:opacity-40"
      >
        {isLoading ? (
          <span className="w-3 h-3 border-2 border-[#0f4c81]/30 border-t-[#0f4c81] rounded-full animate-spin" />
        ) : (
          <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M8 2v8M5 7l3 3 3-3M3 13h10" />
          </svg>
        )}
        {props.label}
      </button>
      {exportError && (
        <p className="text-[10px] text-red-600 max-w-[160px] leading-tight">{exportError}</p>
      )}
    </div>
  );
}
