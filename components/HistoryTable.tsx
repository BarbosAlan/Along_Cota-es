'use client';

import { useState } from 'react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import type { HistoryLog } from '@/types';

interface HistoryTableProps {
  logs: HistoryLog[];
  onRerun: (log: HistoryLog) => void;
}

const CHAIN_COLORS: Record<string, string> = {
  ethereum: '#627EEA',
  polygon:  '#8247E5',
  bitcoin:  '#F7931A',
  solana:   '#9945FF',
  tron:     '#EF0027',
  terra:    '#0C3694',
  cardano:  '#003AC7',
  xrp:      '#00AAE4',
  lisk:     '#0D4F8B',
};

const CHAIN_ABBR: Record<string, string> = {
  ethereum: 'ETH',
  polygon:  'MATIC',
  bitcoin:  'BTC',
  solana:   'SOL',
  tron:     'TRX',
  terra:    'LUNA',
  cardano:  'ADA',
  xrp:      'XRP',
  lisk:     'LSK',
};

function fmtDate(iso: string): string {
  const [y, m, d] = iso.slice(0, 10).split('-');
  return `${d}/${m}/${y}`;
}

function fmtDateTime(iso: string): string {
  return format(new Date(iso), "dd/MM/yy HH:mm", { locale: ptBR });
}

function truncate(str: string, chars = 8): string {
  if (!str || str.length <= chars * 2 + 3) return str;
  return `${str.slice(0, chars)}…${str.slice(-chars)}`;
}

function CopyButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);

  function handleCopy() {
    navigator.clipboard.writeText(value).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }

  return (
    <button
      onClick={handleCopy}
      title={copied ? 'Copiado!' : 'Copiar endereço'}
      className="ml-1.5 text-[#c2c7d1] hover:text-[#0f4c81] transition-colors flex-shrink-0"
    >
      {copied ? (
        <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="2 8 6 12 14 4" />
        </svg>
      ) : (
        <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="4" y="4" width="9" height="9" rx="1" />
          <path d="M3 10H2a1 1 0 0 1-1-1V2a1 1 0 0 1 1-1h7a1 1 0 0 1 1 1v1" />
        </svg>
      )}
    </button>
  );
}

export function HistoryTable({ logs, onRerun }: HistoryTableProps) {
  if (logs.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-[#c2c7d1] px-8 py-14 text-center">
        <p className="text-sm font-semibold text-[#151c27]">Nenhuma consulta registrada</p>
        <p className="text-xs text-[#727780] mt-1.5 leading-relaxed">
          As buscas de transações aparecem aqui automaticamente.
        </p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg border border-[#c2c7d1] overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-[#f0f3ff] border-b border-[#c2c7d1]">
              {[
                ['Data / Hora',   false],
                ['Rede',          false],
                ['Endereço',      false],
                ['Período',       false],
                ['Status',        false],
                ['Transações',    true],
                ['',              false],
              ].map(([h, right], i) => (
                <th
                  key={i}
                  className={`px-4 py-3 text-[10px] font-semibold uppercase tracking-widest text-[#42474f] whitespace-nowrap ${right ? 'text-right' : 'text-left'}`}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {logs.map((log, i) => {
              const color = CHAIN_COLORS[log.blockchain] ?? '#727780';
              const abbr  = CHAIN_ABBR[log.blockchain]  ?? log.blockchain.toUpperCase();
              const success = log.status === 'success';

              return (
                <tr
                  key={log.id}
                  className={`border-b border-[#e7eefe] hover:bg-[#f0f3ff] transition-colors ${
                    i % 2 === 0 ? 'bg-white' : 'bg-[#f9f9ff]'
                  }`}
                >
                  {/* Date/time */}
                  <td className="px-4 py-2.5 font-[var(--font-jetbrains-mono)] text-xs text-[#727780] whitespace-nowrap">
                    {fmtDateTime(log.createdAt)}
                  </td>

                  {/* Blockchain chip */}
                  <td className="px-4 py-2.5">
                    <span
                      style={{ color, borderColor: `${color}55` }}
                      className="px-2 py-0.5 rounded border bg-white text-xs font-[var(--font-jetbrains-mono)] font-semibold"
                    >
                      {abbr}
                    </span>
                  </td>

                  {/* Wallet address */}
                  <td className="px-4 py-2.5">
                    <div className="flex items-center">
                      <span
                        className="font-[var(--font-jetbrains-mono)] text-xs text-[#151c27]"
                        title={log.walletAddress}
                      >
                        {truncate(log.walletAddress)}
                      </span>
                      <CopyButton value={log.walletAddress} />
                    </div>
                  </td>

                  {/* Period */}
                  <td className="px-4 py-2.5 font-[var(--font-jetbrains-mono)] text-xs text-[#42474f] whitespace-nowrap">
                    {fmtDate(log.startDate)} → {fmtDate(log.endDate)}
                  </td>

                  {/* Status */}
                  <td className="px-4 py-2.5">
                    <span
                      className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium ${
                        success
                          ? 'bg-green-50 text-green-800'
                          : 'bg-red-50 text-red-800'
                      }`}
                      title={log.errorMessage ?? undefined}
                    >
                      <span className={`w-1.5 h-1.5 rounded-full ${success ? 'bg-green-500' : 'bg-red-500'}`} />
                      {success ? 'Concluída' : 'Erro'}
                    </span>
                  </td>

                  {/* Transaction count */}
                  <td className="px-4 py-2.5 text-right font-[var(--font-jetbrains-mono)] text-xs text-[#151c27] tabular-nums">
                    {log.totalTransactions !== null ? log.totalTransactions : '—'}
                  </td>

                  {/* Re-run button */}
                  <td className="px-4 py-2.5">
                    <button
                      onClick={() => onRerun(log)}
                      className="flex items-center gap-1 px-2.5 py-1 rounded border border-[#c2c7d1] bg-white hover:bg-[#f0f3ff] hover:border-[#0f4c81] text-[#42474f] hover:text-[#0f4c81] text-xs font-semibold transition-colors whitespace-nowrap"
                    >
                      <svg width="11" height="11" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="1 4 1 10 7 10" />
                        <path d="M3.51 15a9 9 0 1 0 .49-7.51L1 10" />
                      </svg>
                      Re-buscar
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="px-4 py-2.5 border-t border-[#e7eefe] bg-[#f9f9ff]">
        <p className="text-xs text-[#727780]">
          {logs.length} {logs.length === 1 ? 'consulta registrada' : 'consultas registradas'} · últimas 100
        </p>
      </div>
    </div>
  );
}
