'use client';

import { useState } from 'react';
import type { BatchResponse, BatchWalletResult, EnrichedTransactionRow } from '@/types';
import { ExportButton } from '@/components/ExportButton';

const CHAIN_INFO: Record<string, { abbr: string; color: string }> = {
  ethereum: { abbr: 'ETH',  color: '#627EEA' },
  polygon:  { abbr: 'MATIC',color: '#8247E5' },
  bitcoin:  { abbr: 'BTC',  color: '#F7931A' },
  solana:   { abbr: 'SOL',  color: '#9945FF' },
  tron:     { abbr: 'TRX',  color: '#EF0027' },
  terra:    { abbr: 'LUNA', color: '#0C3694' },
  cardano:  { abbr: 'ADA',  color: '#003AC7' },
  xrp:      { abbr: 'XRP',  color: '#00AAE4' },
  lisk:     { abbr: 'LSK',  color: '#0D4F8B' },
};

function fmt(n: number | null, currency: string) {
  if (n === null) return '—';
  return n.toLocaleString('pt-BR', { style: 'currency', currency, minimumFractionDigits: 2 });
}

function shortAddr(addr: string) {
  if (addr.length <= 16) return addr;
  return `${addr.slice(0, 10)}…${addr.slice(-6)}`;
}

function WalletRow({
  result,
  onView,
  onRetry,
  isRetrying,
}: {
  result: BatchWalletResult;
  onView: () => void;
  onRetry?: () => void;
  isRetrying?: boolean;
}) {
  const [copied, setCopied] = useState(false);

  function copy() {
    navigator.clipboard.writeText(result.address).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }

  const isOk = result.status === 'success';

  return (
    <div className={`rounded-lg border ${isOk ? 'border-[#c2c7d1]' : 'border-[#ba1a1a]/30'} bg-white p-4`}>
      <div className="flex items-start gap-3 flex-wrap">

        {/* Status badge */}
        <span
          className={`flex-shrink-0 mt-0.5 inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold ${
            isOk ? 'bg-[#e6f4ea] text-[#1a7f37]' : 'bg-[#ffdad6] text-[#ba1a1a]'
          }`}
        >
          {isOk ? '✓' : '✗'}
          {result.fromCache && isOk && (
            <span className="ml-1 text-[#727780] font-normal">cache</span>
          )}
        </span>

        {/* Address */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-[var(--font-jetbrains-mono)] text-sm text-[#151c27] truncate">
              {shortAddr(result.address)}
            </span>
            <button
              onClick={copy}
              className="text-[10px] text-[#727780] hover:text-[#0f4c81] border border-[#c2c7d1] rounded px-1.5 py-0.5 transition-colors"
            >
              {copied ? 'copiado' : 'copiar'}
            </button>
          </div>

          {/* Chain badges */}
          {result.chains.length > 0 && (
            <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
              {result.chains.map(c => {
                const info = CHAIN_INFO[c];
                return info ? (
                  <span
                    key={c}
                    className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold font-[var(--font-jetbrains-mono)]"
                    style={{ color: info.color, background: `${info.color}18`, border: `1px solid ${info.color}44` }}
                  >
                    {info.abbr}
                  </span>
                ) : null;
              })}
            </div>
          )}

          {/* Error message + retry */}
          {!isOk && (
            <div className="flex items-center gap-2 mt-1 flex-wrap">
              {result.error && (
                <p className="text-xs text-[#93000a]">{result.error}</p>
              )}
              {onRetry && (
                <button
                  onClick={onRetry}
                  disabled={isRetrying}
                  className="text-[11px] font-medium text-[#0f4c81] border border-[#0f4c81]/30 rounded px-2 py-0.5 hover:bg-[#f0f3ff] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {isRetrying ? 'Tentando…' : 'Tentar novamente'}
                </button>
              )}
            </div>
          )}

          {/* Warnings */}
          {result.warnings.length > 0 && (
            <p className="text-xs text-[#b45309] mt-1">{result.warnings.join(' · ')}</p>
          )}
        </div>

        {/* Stats */}
        {isOk && (
          <div className="flex items-center gap-6 flex-shrink-0 ml-auto">
            <div className="text-right">
              <p className="text-[10px] font-semibold uppercase tracking-widest text-[#727780]">Transações</p>
              <p className="text-sm font-semibold text-[#151c27]">{result.summary.total.toLocaleString('pt-BR')}</p>
            </div>
            <div className="text-right">
              <p className="text-[10px] font-semibold uppercase tracking-widest text-[#727780]">Total BRL</p>
              <p className="text-sm font-semibold text-[#151c27]">{fmt(result.summary.totalValueBrl, 'BRL')}</p>
            </div>
            <button
              onClick={onView}
              className="text-xs font-semibold text-[#0f4c81] hover:underline border border-[#0f4c81]/30 rounded px-2.5 py-1 hover:bg-[#f0f3ff] transition-colors"
            >
              Ver
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

interface BatchResultsPanelProps {
  data: BatchResponse;
  onViewWallet: (address: string) => void;
  onRetry?: (address: string) => void;
  retryingAddresses?: Set<string>;
}

export function BatchResultsPanel({ data, onViewWallet, onRetry, retryingAddresses }: BatchResultsPanelProps) {
  const { results, combined } = data;

  const allTransactions: EnrichedTransactionRow[] = results
    .filter(r => r.status === 'success')
    .flatMap(r => r.transactions);

  return (
    <div className="space-y-4">

      {/* Summary banner */}
      <div className="bg-white rounded-lg border border-[#c2c7d1] p-4">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-widest text-[#727780]">Carteiras</p>
            <p className="text-xl font-bold text-[#151c27] mt-0.5">{combined.totalAddresses}</p>
            {combined.errorCount > 0 && (
              <p className="text-xs text-[#ba1a1a]">{combined.errorCount} com erro</p>
            )}
          </div>
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-widest text-[#727780]">Processadas</p>
            <p className="text-xl font-bold text-[#1a7f37] mt-0.5">{combined.successCount}</p>
          </div>
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-widest text-[#727780]">Total Transações</p>
            <p className="text-xl font-bold text-[#151c27] mt-0.5">{combined.totalTransactions.toLocaleString('pt-BR')}</p>
          </div>
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-widest text-[#727780]">Total BRL</p>
            <p className="text-xl font-bold text-[#151c27] mt-0.5">{fmt(combined.totalValueBrl, 'BRL')}</p>
          </div>
        </div>
      </div>

      {/* Per-wallet results */}
      <div className="space-y-2">
        {results.map((r, i) => (
          <WalletRow
            key={i}
            result={r}
            onView={() => onViewWallet(r.address)}
            onRetry={onRetry ? () => onRetry(r.address) : undefined}
            isRetrying={retryingAddresses?.has(r.address)}
          />
        ))}
      </div>

      {/* Export combined */}
      {allTransactions.length > 0 && (
        <div className="flex items-center gap-2 justify-end pt-1">
          <span className="text-xs text-[#727780]">Exportar todas as transações:</span>
          <ExportButton kind="transactions" transactions={allTransactions} walletAddress="lote" format="xlsx" label="Excel" />
          <ExportButton kind="transactions" transactions={allTransactions} walletAddress="lote" format="csv" label="CSV" />
        </div>
      )}
    </div>
  );
}
