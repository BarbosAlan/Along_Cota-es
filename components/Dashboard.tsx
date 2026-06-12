'use client';

import { format, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import type { DashboardData } from '@/types';
import { BLOCKCHAIN_LABELS } from '@/types';

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

const SOURCE_LABELS: Record<string, string> = {
  binance:   'Binance',
  kraken:    'Kraken',
  coingecko: 'CoinGecko',
};

function fmtBrl(v: number | null): string {
  if (v === null) return '—';
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(v);
}

function fmtPtax(v: number | null): string {
  if (v === null) return '—';
  return new Intl.NumberFormat('pt-BR', {
    minimumFractionDigits: 4,
    maximumFractionDigits: 4,
  }).format(v);
}

function fmtNum(v: number): string {
  return new Intl.NumberFormat('pt-BR').format(v);
}

function truncateAddr(addr: string, chars = 8): string {
  if (addr.length <= chars * 2 + 3) return addr;
  return `${addr.slice(0, chars)}…${addr.slice(-chars)}`;
}

/* ── Stat card ── */
function StatCard({
  label,
  value,
  sub,
  accent,
}: {
  label: string;
  value: string;
  sub?: string;
  accent?: string;
}) {
  return (
    <div className="bg-white rounded-lg border border-[#e7eefe] px-5 py-4 flex flex-col gap-1">
      <p className="text-[10px] font-semibold uppercase tracking-widest text-[#727780]">{label}</p>
      <p
        className="text-[22px] font-bold leading-tight"
        style={{ color: accent ?? '#151c27' }}
      >
        {value}
      </p>
      {sub && <p className="text-xs text-[#727780]">{sub}</p>}
    </div>
  );
}

/* ── Horizontal bar row ── */
function BarRow({
  label,
  count,
  max,
  color,
}: {
  label: string;
  count: number;
  max: number;
  color: string;
}) {
  const pct = max > 0 ? (count / max) * 100 : 0;
  return (
    <div className="flex items-center gap-3">
      <span
        className="w-2 h-2 rounded-full flex-shrink-0"
        style={{ background: color }}
      />
      <span className="text-sm text-[#2f3542] w-24 truncate">{label}</span>
      <div className="flex-1 h-1.5 bg-[#e7eefe] rounded-full overflow-hidden">
        <div
          className="h-full rounded-full transition-all"
          style={{ width: `${pct}%`, background: color }}
        />
      </div>
      <span className="text-xs font-[var(--font-jetbrains-mono)] text-[#727780] w-10 text-right">
        {fmtNum(count)}
      </span>
    </div>
  );
}

/* ── Section panel ── */
function Panel({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-white rounded-lg border border-[#e7eefe] px-5 py-4">
      <p className="text-[10px] font-semibold uppercase tracking-widest text-[#727780] mb-4">
        {title}
      </p>
      {children}
    </div>
  );
}

/* ── Main component ── */
export function Dashboard({ data }: { data: DashboardData }) {
  const { transactions, wallets, quotes, ptax, recentSearches } = data;

  const maxChainCount = Math.max(...transactions.byBlockchain.map(b => b.count), 1);
  const maxSourceCount = Math.max(...quotes.bySource.map(s => s.count), 1);

  return (
    <div className="space-y-5 max-w-[1100px]">

      {/* ── Stat cards ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="Transações"
          value={fmtNum(transactions.total)}
          sub={`${fmtNum(transactions.received)} recebidas · ${fmtNum(transactions.sent)} enviadas`}
        />
        <StatCard
          label="Carteiras únicas"
          value={fmtNum(wallets.total)}
          sub="endereços consultados"
        />
        <StatCard
          label="Valor total BRL"
          value={fmtBrl(transactions.totalValueBrl)}
          sub={transactions.totalValueBrl !== null ? 'soma de todas as transações' : 'sem dados de preço ainda'}
          accent={transactions.totalValueBrl !== null ? '#0f4c81' : undefined}
        />
        <StatCard
          label="PTAX atual"
          value={fmtPtax(ptax.latest)}
          sub={
            ptax.date
              ? `${format(parseISO(ptax.date), "dd 'de' MMMM", { locale: ptBR })} · ${fmtNum(ptax.totalCached)} dias em cache`
              : 'sem dados'
          }
        />
      </div>

      {/* ── Breakdown panels ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

        {/* Blockchain breakdown */}
        <Panel title="Transações por blockchain">
          {transactions.byBlockchain.length === 0 ? (
            <p className="text-sm text-[#727780]">Nenhuma transação no banco ainda.</p>
          ) : (
            <div className="space-y-3">
              {transactions.byBlockchain.map(b => (
                <BarRow
                  key={b.blockchain}
                  label={BLOCKCHAIN_LABELS[b.blockchain as keyof typeof BLOCKCHAIN_LABELS] ?? b.blockchain}
                  count={b.count}
                  max={maxChainCount}
                  color={CHAIN_COLORS[b.blockchain] ?? '#727780'}
                />
              ))}
            </div>
          )}
        </Panel>

        {/* Quotes cache */}
        <Panel title="Cache de cotações">
          <div className="space-y-3 mb-4">
            {quotes.bySource.length === 0 ? (
              <p className="text-sm text-[#727780]">Nenhuma cotação em cache ainda.</p>
            ) : (
              quotes.bySource.map(s => (
                <BarRow
                  key={s.source}
                  label={SOURCE_LABELS[s.source] ?? s.source}
                  count={s.count}
                  max={maxSourceCount}
                  color={
                    s.source === 'binance'   ? '#F0B90B' :
                    s.source === 'kraken'    ? '#5741D9' :
                    s.source === 'coingecko' ? '#8DC647' :
                    '#727780'
                  }
                />
              ))
            )}
          </div>
          <div className="flex items-center gap-4 pt-3 border-t border-[#e7eefe]">
            <div className="text-center">
              <p className="text-lg font-bold text-[#151c27]">{fmtNum(quotes.total)}</p>
              <p className="text-[10px] uppercase tracking-widest text-[#727780]">cotações</p>
            </div>
            <div className="w-px h-8 bg-[#e7eefe]" />
            <div className="text-center">
              <p className="text-lg font-bold text-[#151c27]">{fmtNum(quotes.uniqueSymbols)}</p>
              <p className="text-[10px] uppercase tracking-widest text-[#727780]">moedas</p>
            </div>
            <div className="w-px h-8 bg-[#e7eefe]" />
            <div className="text-center">
              <p className="text-lg font-bold text-[#151c27]">{fmtNum(ptax.totalCached)}</p>
              <p className="text-[10px] uppercase tracking-widest text-[#727780]">PTAX dias</p>
            </div>
          </div>
        </Panel>
      </div>

      {/* ── Recent searches ── */}
      <Panel title="Últimas consultas">
        {recentSearches.length === 0 ? (
          <p className="text-sm text-[#727780]">Nenhuma consulta realizada ainda.</p>
        ) : (
          <div className="overflow-x-auto -mx-1">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[#e7eefe]">
                  <th className="text-left py-2 px-2 text-[10px] font-semibold uppercase tracking-widest text-[#727780]">Blockchain</th>
                  <th className="text-left py-2 px-2 text-[10px] font-semibold uppercase tracking-widest text-[#727780]">Carteira</th>
                  <th className="text-right py-2 px-2 text-[10px] font-semibold uppercase tracking-widest text-[#727780]">Transações</th>
                  <th className="text-left py-2 px-2 text-[10px] font-semibold uppercase tracking-widest text-[#727780]">Status</th>
                  <th className="text-right py-2 px-2 text-[10px] font-semibold uppercase tracking-widest text-[#727780]">Data</th>
                </tr>
              </thead>
              <tbody>
                {recentSearches.map(s => (
                  <tr key={s.id} className="border-b border-[#f0f2f8] hover:bg-[#f9f9ff] transition-colors">
                    <td className="py-2.5 px-2">
                      <span
                        className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold font-[var(--font-jetbrains-mono)]"
                        style={{
                          color: CHAIN_COLORS[s.blockchain] ?? '#42474f',
                          background: `${CHAIN_COLORS[s.blockchain] ?? '#42474f'}18`,
                        }}
                      >
                        {BLOCKCHAIN_LABELS[s.blockchain as keyof typeof BLOCKCHAIN_LABELS] ?? s.blockchain}
                      </span>
                    </td>
                    <td className="py-2.5 px-2 font-[var(--font-jetbrains-mono)] text-xs text-[#42474f]">
                      {truncateAddr(s.walletAddress)}
                    </td>
                    <td className="py-2.5 px-2 text-right font-[var(--font-jetbrains-mono)] text-xs text-[#42474f]">
                      {s.totalTransactions !== null ? fmtNum(s.totalTransactions) : '—'}
                    </td>
                    <td className="py-2.5 px-2">
                      <span
                        className={`inline-flex items-center gap-1 text-[11px] font-semibold ${
                          s.status === 'success' ? 'text-[#1a7f4e]' :
                          s.status === 'error'   ? 'text-[#ba1a1a]' :
                          'text-[#727780]'
                        }`}
                      >
                        <span className={`w-1.5 h-1.5 rounded-full ${
                          s.status === 'success' ? 'bg-[#1a7f4e]' :
                          s.status === 'error'   ? 'bg-[#ba1a1a]' :
                          'bg-[#727780]'
                        }`} />
                        {s.status === 'success' ? 'Sucesso' : s.status === 'error' ? 'Erro' : s.status}
                      </span>
                    </td>
                    <td className="py-2.5 px-2 text-right text-xs text-[#727780]">
                      {format(new Date(s.createdAt), "dd/MM/yy HH:mm", { locale: ptBR })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </div>
  );
}
