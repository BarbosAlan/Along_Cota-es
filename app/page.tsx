'use client';

import { useState, useEffect } from 'react';
import { SearchForm } from '@/components/SearchForm';
import { ResultsTable } from '@/components/ResultsTable';
import { ExportButton } from '@/components/ExportButton';
import { LoadingState } from '@/components/LoadingState';
import { QuotesForm } from '@/components/QuotesForm';
import { QuotesTable } from '@/components/QuotesTable';
import { HistoryTable } from '@/components/HistoryTable';
import { Dashboard } from '@/components/Dashboard';
import { SettingsPanel } from '@/components/SettingsPanel';
import { BatchSearchForm } from '@/components/BatchSearchForm';
import { BatchResultsPanel } from '@/components/BatchResultsPanel';
import type { BatchFormData } from '@/components/BatchSearchForm';
import type { SearchResponse, QuotesResponse, HistoryLog, DashboardData, BatchResponse } from '@/types';
import type { z } from 'zod';
import type { searchRequestSchema, quotesRequestSchema } from '@/lib/validation';

type SearchFormData = z.infer<typeof searchRequestSchema>;
type QuotesFormData = z.infer<typeof quotesRequestSchema>;
type NavItem = 'dashboard' | 'transactions' | 'batch' | 'quotes' | 'history' | 'settings';

/* ── SVG Icons ── */
function IconTransactions() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 1l4 4-4 4" /><path d="M3 11V9a4 4 0 0 1 4-4h14" />
      <path d="M7 23l-4-4 4-4" /><path d="M21 13v2a4 4 0 0 1-4 4H3" />
    </svg>
  );
}
function IconQuotes() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="22 7 13.5 15.5 8.5 10.5 2 17" />
      <polyline points="16 7 22 7 22 13" />
    </svg>
  );
}
function IconDashboard() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" />
      <rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" />
    </svg>
  );
}
function IconHistory() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
      <path d="M3 3v5h5" /><path d="M12 7v5l4 2" />
    </svg>
  );
}
function IconBatch() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="3" width="20" height="4" rx="1" />
      <rect x="2" y="10" width="20" height="4" rx="1" />
      <rect x="2" y="17" width="20" height="4" rx="1" />
    </svg>
  );
}
function IconSettings() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  );
}
function IconHex() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="1.5" strokeLinejoin="round">
      <path d="M12 2L21 7V17L12 22L3 17V7L12 2Z" />
      <path d="M12 2V22M3 7L21 17M21 7L3 17" strokeOpacity="0.5" />
    </svg>
  );
}

/* ── Sidebar nav item ── */
function NavLink({
  icon, label, active, disabled, onClick,
}: {
  icon: React.ReactNode; label: string; active?: boolean; disabled?: boolean; onClick?: () => void;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`w-full flex items-center gap-3 px-3 py-2.5 rounded text-sm font-medium transition-all text-left ${
        active
          ? 'bg-white/15 text-white'
          : disabled
          ? 'text-white/30 cursor-not-allowed'
          : 'text-white/70 hover:bg-white/10 hover:text-white'
      }`}
    >
      <span className={`flex-shrink-0 ${active ? 'opacity-100' : 'opacity-70'}`}>{icon}</span>
      {label}
      {disabled && (
        <span className="ml-auto text-[10px] font-mono text-white/30 border border-white/20 px-1.5 py-0.5 rounded">
          em breve
        </span>
      )}
    </button>
  );
}

const VALID_NAV: NavItem[] = ['dashboard', 'transactions', 'batch', 'quotes', 'history', 'settings'];

export default function HomePage() {
  const [activeNav, setActiveNav] = useState<NavItem>('dashboard');

  const [txLoading, setTxLoading] = useState(false);
  const [txResult, setTxResult] = useState<SearchResponse | null>(null);
  const [txError, setTxError] = useState<string | null>(null);
  const [txLastQuery, setTxLastQuery] = useState<SearchFormData | null>(null);
  const [txFormKey, setTxFormKey] = useState(0);
  const [txPrefill, setTxPrefill] = useState<Partial<SearchFormData> | undefined>(undefined);

  const [qLoading, setQLoading] = useState(false);
  const [qResult, setQResult] = useState<QuotesResponse | null>(null);
  const [qError, setQError] = useState<string | null>(null);

  const [batchLoading, setBatchLoading] = useState(false);
  const [batchResults, setBatchResults] = useState<BatchResponse | null>(null);
  const [batchError, setBatchError] = useState<string | null>(null);
  const [batchLastQuery, setBatchLastQuery] = useState<BatchFormData | null>(null);
  const [batchRetrying, setBatchRetrying] = useState<Set<string>>(new Set());

  const [historyLogs, setHistoryLogs] = useState<HistoryLog[] | null>(null);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);

  const [dashboardData, setDashboardData] = useState<DashboardData | null>(null);
  const [dashboardLoading, setDashboardLoading] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem('activeNav') as NavItem | null;
    if (saved && VALID_NAV.includes(saved)) {
      setActiveNav(saved);
      if (saved === 'history') {
        setHistoryLoading(true);
        const adminToken = process.env.NEXT_PUBLIC_ADMIN_SECRET;
        setHistoryError(null);
        fetch('/api/history', {
          headers: adminToken ? { Authorization: `Bearer ${adminToken}` } : {},
        })
          .then(r => r.json())
          .then(data => setHistoryLogs(data.logs))
          .catch(() => setHistoryError('Não foi possível carregar o histórico de buscas.'))
          .finally(() => setHistoryLoading(false));
      } else if (saved === 'dashboard') {
        loadDashboard();
      }
    } else {
      loadDashboard();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function loadDashboard() {
    setDashboardLoading(true);
    fetch('/api/dashboard')
      .then(r => r.json())
      .then(data => setDashboardData(data as DashboardData))
      .catch(() => setDashboardData(null))
      .finally(() => setDashboardLoading(false));
  }

  function navigateTo(nav: NavItem) {
    setActiveNav(nav);
    localStorage.setItem('activeNav', nav);
    if (nav === 'dashboard') {
      loadDashboard();
    }
    if (nav === 'history') {
      setHistoryLoading(true);
      fetch('/api/history')
        .then(r => r.json())
        .then(data => setHistoryLogs(data.logs))
        .catch(() => setHistoryLogs([]))
        .finally(() => setHistoryLoading(false));
    }
  }

  function handleRerun(log: HistoryLog) {
    const data: SearchFormData = {
      walletAddress: log.walletAddress,
      startDate: log.startDate.slice(0, 10),
      endDate: log.endDate.slice(0, 10),
    };
    setTxPrefill(data);
    setTxFormKey(k => k + 1);
    setActiveNav('transactions');
    handleSearch(data);
  }

  async function handleSearch(data: SearchFormData, forceRefresh = false) {
    setTxLoading(true);
    setTxError(null);
    setTxResult(null);
    setTxLastQuery(data);
    try {
      const res = await fetch('/api/transactions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          walletAddress: data.walletAddress,
          startDate: data.startDate,
          endDate: data.endDate,
          ...(forceRefresh ? { forceRefresh: true } : {}),
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.message ?? json.error ?? 'Erro ao buscar transações');
      setTxResult(json as SearchResponse);
    } catch (err) {
      setTxError(err instanceof Error ? err.message : 'Erro desconhecido');
    } finally {
      setTxLoading(false);
    }
  }

  function handleForceRefresh() {
    if (txLastQuery) handleSearch(txLastQuery, true);
  }

  async function handleBatchSearch(data: BatchFormData) {
    setBatchLoading(true);
    setBatchError(null);
    setBatchResults(null);
    setBatchLastQuery(data);
    try {
      const res = await fetch('/api/batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.message ?? json.error ?? 'Erro ao buscar carteiras');
      setBatchResults(json as BatchResponse);
    } catch (err) {
      setBatchError(err instanceof Error ? err.message : 'Erro desconhecido');
    } finally {
      setBatchLoading(false);
    }
  }

  async function handleRetryBatchWallet(address: string) {
    if (!batchLastQuery || !batchResults) return;
    setBatchRetrying(prev => new Set(prev).add(address));
    try {
      const res = await fetch('/api/batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          addresses: [address],
          startDate: batchLastQuery.startDate,
          endDate: batchLastQuery.endDate,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        const errMsg = (json as { message?: string; error?: string })?.message
          ?? (json as { message?: string; error?: string })?.error
          ?? 'Erro ao tentar novamente';
        setBatchResults(prev => {
          if (!prev) return prev;
          const newResults = prev.results.map(r =>
            r.address === address ? { ...r, error: errMsg } : r
          );
          return { ...prev, results: newResults };
        });
        return;
      }
      const newResult = json.results[0];
      if (!newResult) return;
      setBatchResults(prev => {
        if (!prev) return prev;
        const newResults = prev.results.map(r => r.address === address ? newResult : r);
        const successCount = newResults.filter(r => r.status === 'success').length;
        const errorCount = newResults.filter(r => r.status === 'error').length;
        const totalTransactions = newResults.reduce((sum, r) => sum + r.transactions.length, 0);
        const totalValueBrl = newResults.reduce((sum, r) => r.summary.totalValueBrl !== null ? sum + r.summary.totalValueBrl : sum, 0);
        const totalValueUsd = newResults.reduce((sum, r) => r.summary.totalValueUsd !== null ? sum + r.summary.totalValueUsd : sum, 0);
        return {
          results: newResults,
          combined: { ...prev.combined, successCount, errorCount, totalTransactions, totalValueBrl, totalValueUsd },
        };
      });
    } finally {
      setBatchRetrying(prev => { const s = new Set(prev); s.delete(address); return s; });
    }
  }

  function handleViewBatchWallet(address: string) {
    const data: SearchFormData = {
      walletAddress: address,
      startDate: batchResults
        ? (() => {
            const r = batchResults.results.find(r => r.address === address);
            return r?.transactions[0]?.date?.slice(0, 10) ?? new Date().toISOString().slice(0, 10);
          })()
        : new Date().toISOString().slice(0, 10),
      endDate: new Date().toISOString().slice(0, 10),
    };
    setTxPrefill({ walletAddress: address, startDate: data.startDate, endDate: data.endDate });
    setTxFormKey(k => k + 1);
    setActiveNav('transactions');
    handleSearch({ walletAddress: address, startDate: data.startDate, endDate: data.endDate });
  }

  async function handleQuotesSearch(data: QuotesFormData) {
    setQLoading(true);
    setQError(null);
    setQResult(null);
    try {
      const res = await fetch('/api/quotes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.message ?? json.error ?? 'Erro ao buscar cotações');
      setQResult(json as QuotesResponse);
    } catch (err) {
      setQError(err instanceof Error ? err.message : 'Erro desconhecido');
    } finally {
      setQLoading(false);
    }
  }

  const pageTitle =
    activeNav === 'dashboard'    ? 'Dashboard'      :
    activeNav === 'transactions' ? 'Transações'     :
    activeNav === 'batch'        ? 'Busca em Lote'  :
    activeNav === 'quotes'       ? 'Cotações'       :
    activeNav === 'settings'     ? 'Configurações'  : 'Histórico';
  const pageDesc =
    activeNav === 'dashboard'
      ? 'Visão geral do sistema — transações, cotações em cache e consultas recentes'
      : activeNav === 'transactions'
      ? 'Histórico de carteiras blockchain convertido para BRL pela taxa PTAX do Banco Central'
      : activeNav === 'batch'
      ? 'Busca simultânea em até 10 carteiras — resultados consolidados com exportação combinada'
      : activeNav === 'quotes'
      ? 'Cotações diárias com câmbio oficial do Banco Central (PTAX)'
      : activeNav === 'settings'
      ? 'Chaves de API e gerenciamento de cache do sistema'
      : 'Registro das últimas 100 consultas de transações realizadas no sistema';

  return (
    <div className="flex h-screen overflow-hidden bg-[#f9f9ff]">

      {/* ── Sidebar ── */}
      <aside className="w-[280px] flex-shrink-0 bg-[#0f4c81] flex flex-col h-full overflow-y-auto">
        {/* Brand */}
        <div className="px-5 py-5 border-b border-white/10">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-white/15 flex items-center justify-center flex-shrink-0">
              <IconHex />
            </div>
            <div>
              <p className="text-white font-semibold text-sm leading-tight">Crypto Quote Finder</p>
              <p className="text-white/50 text-xs font-[var(--font-jetbrains-mono)] mt-0.5">Explorer</p>
            </div>
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 px-3 py-4 space-y-0.5">
          <p className="text-white/40 text-[10px] font-semibold uppercase tracking-widest px-3 mb-2">Menu</p>

          <NavLink
            icon={<IconDashboard />}
            label="Dashboard"
            active={activeNav === 'dashboard'}
            onClick={() => navigateTo('dashboard')}
          />
          <NavLink
            icon={<IconTransactions />}
            label="Transações"
            active={activeNav === 'transactions'}
            onClick={() => navigateTo('transactions')}
          />
          <NavLink
            icon={<IconBatch />}
            label="Busca em Lote"
            active={activeNav === 'batch'}
            onClick={() => navigateTo('batch')}
          />
          <NavLink
            icon={<IconQuotes />}
            label="Cotações"
            active={activeNav === 'quotes'}
            onClick={() => navigateTo('quotes')}
          />
          <NavLink
            icon={<IconHistory />}
            label="Histórico"
            active={activeNav === 'history'}
            onClick={() => navigateTo('history')}
          />
        </nav>

        {/* Bottom */}
        <div className="px-3 py-4 border-t border-white/10 space-y-0.5">
          <NavLink icon={<IconSettings />} label="Configurações" active={activeNav === 'settings'} onClick={() => navigateTo('settings')} />
        </div>
      </aside>

      {/* ── Main ── */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">

        {/* Top bar */}
        <header className="bg-white border-b border-[#c2c7d1] px-8 py-0 flex items-center justify-between h-[60px] flex-shrink-0">
          <div>
            <h1 className="text-[15px] font-semibold text-[#151c27]">{pageTitle}</h1>
            <p className="text-xs text-[#727780]">{pageDesc}</p>
          </div>

          {/* Export actions */}
          <div className="flex items-center gap-2">
            {activeNav === 'transactions' && txResult && txLastQuery && (
              <>
                <ExportButton kind="transactions" transactions={txResult.transactions} walletAddress={txLastQuery.walletAddress} format="xlsx" label="Excel" />
                <ExportButton kind="transactions" transactions={txResult.transactions} walletAddress={txLastQuery.walletAddress} format="csv" label="CSV" />
              </>
            )}
            {activeNav === 'quotes' && qResult && (
              <>
                <ExportButton kind="quotes" quotes={qResult.rows} symbol={qResult.symbol} format="xlsx" label="Excel" />
                <ExportButton kind="quotes" quotes={qResult.rows} symbol={qResult.symbol} format="csv" label="CSV" />
              </>
            )}
          </div>
        </header>

        {/* Content */}
        <main className="flex-1 overflow-y-auto px-8 py-6">

          {/* Dashboard */}
          {activeNav === 'dashboard' && (
            <div>
              {dashboardLoading && !dashboardData && <LoadingState message="Carregando dados…" />}
              {dashboardData && (
                <div className="space-y-2">
                  <div className="flex justify-end mb-1">
                    <button
                      onClick={loadDashboard}
                      disabled={dashboardLoading}
                      className="text-xs text-[#0f4c81] hover:underline font-medium disabled:opacity-50"
                    >
                      {dashboardLoading ? 'Atualizando…' : 'Atualizar'}
                    </button>
                  </div>
                  <Dashboard data={dashboardData} />
                </div>
              )}
              {!dashboardLoading && !dashboardData && (
                <div className="rounded-lg border border-dashed border-[#c2c7d1] px-8 py-10 text-center">
                  <p className="text-sm text-[#727780]">Não foi possível carregar os dados do dashboard.</p>
                </div>
              )}
            </div>
          )}

          {/* Transactions */}
          {activeNav === 'transactions' && (
            <div className="space-y-5 max-w-[1200px]">
              <SearchForm
                key={txFormKey}
                onSearch={handleSearch}
                isLoading={txLoading}
                defaultValues={txPrefill}
              />

              {txError && (
                <div className="bg-[#ffdad6] border border-[#ba1a1a]/30 rounded-lg p-4">
                  <p className="text-sm font-semibold text-[#ba1a1a]">Erro na consulta</p>
                  <p className="text-sm text-[#93000a] mt-1">{txError}</p>
                </div>
              )}

              {txLoading && <LoadingState />}

              {txResult && !txLoading && (
                <ResultsTable
                  transactions={txResult.transactions}
                  summary={txResult.summary}
                  fromCache={txResult.fromCache}
                  warnings={txResult.warnings}
                  onRefresh={handleForceRefresh}
                  isRefreshing={txLoading}
                />
              )}

              {!txLoading && !txResult && !txError && (
                <div className="rounded-lg border border-dashed border-[#c2c7d1] px-8 py-10 text-center">
                  <p className="text-[10px] font-semibold uppercase tracking-widest text-[#727780] mb-3">Redes suportadas</p>
                  <div className="flex flex-wrap justify-center gap-2 max-w-sm mx-auto">
                    {[
                      { abbr: 'ETH',  color: '#627EEA' },
                      { abbr: 'MATIC',color: '#8247E5' },
                      { abbr: 'BTC',  color: '#F7931A' },
                      { abbr: 'SOL',  color: '#9945FF' },
                      { abbr: 'TRX',  color: '#EF0027' },
                      { abbr: 'LUNA', color: '#0C3694' },
                      { abbr: 'ADA',  color: '#003AC7' },
                      { abbr: 'XRP',  color: '#00AAE4' },
                      { abbr: 'LSK',  color: '#0D4F8B' },
                    ].map(b => (
                      <span
                        key={b.abbr}
                        style={{ color: b.color, borderColor: `${b.color}55` }}
                        className="px-2.5 py-1 rounded border bg-white text-xs font-[var(--font-jetbrains-mono)] font-semibold"
                      >
                        {b.abbr}
                      </span>
                    ))}
                  </div>
                  <p className="text-xs text-[#727780] mt-5 leading-relaxed">
                    Cole o endereço da carteira — a rede é detectada automaticamente.<br />
                    Os valores são convertidos para BRL pela taxa PTAX do Banco Central.
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Batch */}
          {activeNav === 'batch' && (
            <div className="space-y-5 max-w-[1100px]">
              <BatchSearchForm onSearch={handleBatchSearch} isLoading={batchLoading} />

              {batchError && (
                <div className="bg-[#ffdad6] border border-[#ba1a1a]/30 rounded-lg p-4">
                  <p className="text-sm font-semibold text-[#ba1a1a]">Erro na consulta</p>
                  <p className="text-sm text-[#93000a] mt-1">{batchError}</p>
                </div>
              )}

              {batchLoading && <LoadingState message="Buscando carteiras em paralelo…" />}

              {batchResults && !batchLoading && (
                <BatchResultsPanel
                  data={batchResults}
                  onViewWallet={handleViewBatchWallet}
                  onRetry={handleRetryBatchWallet}
                  retryingAddresses={batchRetrying}
                />
              )}

              {!batchLoading && !batchResults && !batchError && (
                <div className="rounded-lg border border-dashed border-[#c2c7d1] px-8 py-10 text-center">
                  <p className="text-[10px] font-semibold uppercase tracking-widest text-[#727780] mb-2">Busca em lote</p>
                  <p className="text-xs text-[#727780] leading-relaxed max-w-sm mx-auto">
                    Cole até 10 endereços de carteira no campo acima — um por linha ou separados por vírgula.<br />
                    Todas as carteiras são processadas em paralelo e os resultados aparecem consolidados.
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Quotes */}
          {activeNav === 'quotes' && (
            <div className="space-y-5 max-w-[900px]">
              <QuotesForm onSearch={handleQuotesSearch} isLoading={qLoading} />

              {qError && (
                <div className="bg-[#ffdad6] border border-[#ba1a1a]/30 rounded-lg p-4">
                  <p className="text-sm font-semibold text-[#ba1a1a]">Erro na consulta</p>
                  <p className="text-sm text-[#93000a] mt-1">{qError}</p>
                </div>
              )}

              {qLoading && <LoadingState message="Buscando cotações…" />}

              {qResult && !qLoading && (
                <QuotesTable symbol={qResult.symbol} rows={qResult.rows} />
              )}

              {!qLoading && !qResult && !qError && (
                <div className="rounded-lg border border-dashed border-[#c2c7d1] px-8 py-10 text-center">
                  <p className="text-[10px] font-semibold uppercase tracking-widest text-[#727780] mb-3">Moedas disponíveis</p>
                  <div className="flex flex-wrap justify-center gap-2 max-w-sm mx-auto">
                    {['BTC', 'ETH', 'SOL', 'BNB', 'XRP', 'ADA', 'USDT', 'USDC'].map(sym => (
                      <span
                        key={sym}
                        className="px-2.5 py-1 rounded border border-[#c2c7d1] bg-white text-xs font-[var(--font-jetbrains-mono)] font-semibold text-[#42474f]"
                      >
                        {sym}
                      </span>
                    ))}
                    <span className="px-2.5 py-1 rounded border border-dashed border-[#c2c7d1] text-xs font-[var(--font-jetbrains-mono)] font-semibold text-[#727780]">
                      +outros
                    </span>
                  </div>
                  <p className="text-xs text-[#727780] mt-5 leading-relaxed">
                    Digite o símbolo da moeda e defina o período.<br />
                    Cada dia inclui preço em USD e conversão PTAX para BRL.
                  </p>
                </div>
              )}
            </div>
          )}
          {/* History */}
          {activeNav === 'history' && (
            <div className="space-y-5 max-w-[1100px]">
              {historyLoading && (
                <div className="animate-pulse space-y-2">
                  <div className="h-10 bg-white rounded border border-[#c2c7d1]" />
                  {Array.from({ length: 6 }).map((_, i) => (
                    <div key={i} className="h-11 bg-white rounded border border-[#e7eefe]" />
                  ))}
                </div>
              )}
              {!historyLoading && historyError && (
                <div className="bg-[#ffdad6] border border-[#ba1a1a]/30 rounded-lg p-4">
                  <p className="text-sm font-semibold text-[#ba1a1a]">Erro ao carregar histórico</p>
                  <p className="text-sm text-[#93000a] mt-1">{historyError}</p>
                </div>
              )}
              {!historyLoading && !historyError && historyLogs !== null && (
                <HistoryTable logs={historyLogs} onRerun={handleRerun} />
              )}
            </div>
          )}

          {/* Settings */}
          {activeNav === 'settings' && <SettingsPanel />}

        </main>
      </div>
    </div>
  );
}
