'use client';

import { useState, useEffect, useCallback } from 'react';

interface ApiKeys {
  etherscan: boolean;
  helius: boolean;
  coingecko: boolean;
  trongrid: boolean;
}

interface CacheCounts {
  ptax: number;
  quotes: number;
  transactions: number;
  searchLogs: number;
}

interface SettingsData {
  apiKeys: ApiKeys;
  caches: CacheCounts;
}

function StatusDot({ ok }: { ok: boolean }) {
  return (
    <span className={`inline-block w-2 h-2 rounded-full ${ok ? 'bg-green-500' : 'bg-red-400'}`} />
  );
}

function fmtNum(n: number): string {
  return n.toLocaleString('pt-BR');
}

export function SettingsPanel() {
  const [data, setData] = useState<SettingsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [clearing, setClearing] = useState<string | null>(null);
  const [message, setMessage] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/settings');
      if (!res.ok) throw new Error('Falha ao carregar configurações');
      setData(await res.json());
    } catch {
      setMessage({ type: 'err', text: 'Não foi possível carregar as configurações.' });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function clear(action: string, label: string) {
    if (!confirm(`Limpar ${label}? Esta ação não pode ser desfeita.`)) return;
    setClearing(action);
    setMessage(null);
    try {
      const res = await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'Erro');
      setMessage({ type: 'ok', text: `${label} limpo — ${fmtNum(json.deleted)} registros removidos.` });
      await load();
    } catch (err) {
      setMessage({ type: 'err', text: err instanceof Error ? err.message : 'Erro desconhecido' });
    } finally {
      setClearing(null);
    }
  }

  const API_KEY_LABELS: [keyof ApiKeys, string, string][] = [
    ['etherscan', 'Etherscan',  'Ethereum & Polygon (EVM)'],
    ['helius',    'Helius',     'Solana'],
    ['coingecko', 'CoinGecko',  'Cotações (Pro tier)'],
    ['trongrid',  'TronGrid',   'Tron'],
  ];

  const CACHE_ACTIONS: { action: string; label: string; key: keyof CacheCounts; desc: string }[] = [
    { action: 'clear_ptax',         label: 'Cache PTAX',        key: 'ptax',         desc: 'Taxas de câmbio USD/BRL do Banco Central' },
    { action: 'clear_quotes',       label: 'Cache de cotações', key: 'quotes',       desc: 'Preços históricos de criptoativos em USD' },
    { action: 'clear_transactions', label: 'Transações',        key: 'transactions', desc: 'Transações e logs de busca armazenados' },
  ];

  return (
    <div className="space-y-6 max-w-[800px]">
      {message && (
        <div className={`rounded-lg px-4 py-3 text-sm ${
          message.type === 'ok'
            ? 'bg-green-50 border border-green-200 text-green-800'
            : 'bg-red-50 border border-red-200 text-red-800'
        }`}>
          {message.text}
        </div>
      )}

      {/* API Keys */}
      <div className="bg-white rounded-lg border border-[#c2c7d1] overflow-hidden">
        <div className="px-5 py-4 border-b border-[#c2c7d1] bg-[#f0f3ff]">
          <h2 className="text-sm font-semibold text-[#151c27]">Chaves de API</h2>
          <p className="text-xs text-[#727780] mt-0.5">Configuradas via variáveis de ambiente no servidor.</p>
        </div>
        {loading ? (
          <div className="px-5 py-8 text-center text-sm text-[#727780]">Carregando…</div>
        ) : (
          <div className="divide-y divide-[#e7eefe]">
            {API_KEY_LABELS.map(([key, name, desc]) => (
              <div key={key} className="flex items-center justify-between px-5 py-3.5">
                <div>
                  <p className="text-sm font-medium text-[#151c27]">{name}</p>
                  <p className="text-xs text-[#727780]">{desc}</p>
                </div>
                <div className="flex items-center gap-2 text-xs">
                  <StatusDot ok={!!data?.apiKeys[key]} />
                  <span className={data?.apiKeys[key] ? 'text-green-700' : 'text-[#727780]'}>
                    {data?.apiKeys[key] ? 'Configurada' : 'Não configurada'}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Cache Management */}
      <div className="bg-white rounded-lg border border-[#c2c7d1] overflow-hidden">
        <div className="px-5 py-4 border-b border-[#c2c7d1] bg-[#f0f3ff]">
          <h2 className="text-sm font-semibold text-[#151c27]">Gerenciamento de cache</h2>
          <p className="text-xs text-[#727780] mt-0.5">Dados armazenados no banco para evitar chamadas repetidas às APIs externas.</p>
        </div>
        {loading ? (
          <div className="px-5 py-8 text-center text-sm text-[#727780]">Carregando…</div>
        ) : (
          <div className="divide-y divide-[#e7eefe]">
            {CACHE_ACTIONS.map(({ action, label, key, desc }) => (
              <div key={action} className="flex items-center justify-between px-5 py-3.5">
                <div>
                  <p className="text-sm font-medium text-[#151c27]">{label}</p>
                  <p className="text-xs text-[#727780]">{desc}</p>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-xs font-mono text-[#42474f] tabular-nums">
                    {fmtNum(data?.caches[key] ?? 0)} registros
                  </span>
                  <button
                    onClick={() => clear(action, label)}
                    disabled={clearing !== null || (data?.caches[key] ?? 0) === 0}
                    className="px-3 py-1.5 text-xs font-medium text-red-700 border border-red-200 rounded hover:bg-red-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                  >
                    {clearing === action ? 'Limpando…' : 'Limpar'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <button
        onClick={load}
        disabled={loading}
        className="text-xs text-[#727780] hover:text-[#42474f] flex items-center gap-1.5 transition-colors"
      >
        <svg className={`w-3 h-3 ${loading ? 'animate-spin' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
        </svg>
        Atualizar
      </button>
    </div>
  );
}
