'use client';

import { useState } from 'react';
import { detectBlockchains } from '@/lib/utils/address';
import {
  format, subDays, subMonths, subYears,
  startOfMonth, endOfMonth, startOfYear, endOfYear,
} from 'date-fns';

export interface BatchFormData {
  addresses: string[];
  startDate: string;
  endDate: string;
}

interface BatchSearchFormProps {
  onSearch: (data: BatchFormData) => void;
  isLoading: boolean;
}

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

function getDatePresets() {
  const today = new Date();
  const fmt = (d: Date) => format(d, 'yyyy-MM-dd');
  const prevYear = today.getFullYear() - 1;
  const currYear = today.getFullYear();
  return [
    { label: '7 dias',   start: fmt(subDays(today, 6)),                         end: fmt(today) },
    { label: '30 dias',  start: fmt(subDays(today, 29)),                        end: fmt(today) },
    { label: '3 meses',  start: fmt(subMonths(today, 3)),                       end: fmt(today) },
    { label: 'Este mês', start: fmt(startOfMonth(today)),                       end: fmt(today) },
    { label: 'Mês ant.', start: fmt(startOfMonth(subMonths(today, 1))),         end: fmt(endOfMonth(subMonths(today, 1))) },
    { label: String(prevYear), start: fmt(startOfYear(subYears(today, 1))),     end: fmt(endOfYear(subYears(today, 1))) },
    { label: String(currYear), start: fmt(startOfYear(today)),                  end: fmt(today) },
  ];
}

function parseAddresses(raw: string): string[] {
  return [...new Set(
    raw.split(/[\n,]+/)
      .map(s => s.trim())
      .filter(s => s.length >= 10),
  )];
}

const inputClass =
  'w-full rounded border border-[#c2c7d1] bg-white px-3 py-2 text-sm text-[#151c27] placeholder:text-[#727780] focus:outline-none focus:ring-2 focus:ring-[#0f4c81] focus:border-transparent transition';
const labelClass = 'block text-xs font-semibold text-[#42474f] mb-1.5';

export function BatchSearchForm({ onSearch, isLoading }: BatchSearchFormProps) {
  const today = format(new Date(), 'yyyy-MM-dd');
  const [raw, setRaw] = useState('');
  const [startDate, setStartDate] = useState(today);
  const [endDate, setEndDate] = useState(today);
  const [dateError, setDateError] = useState('');

  const presets = getDatePresets();
  const addresses = parseAddresses(raw);
  const MAX = 10;
  const overLimit = addresses.length > MAX;

  function applyPreset(start: string, end: string) {
    setStartDate(start);
    setEndDate(end);
    setDateError('');
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (addresses.length === 0) return;
    if (overLimit) return;
    const todayStr = format(new Date(), 'yyyy-MM-dd');
    if (startDate > endDate) {
      setDateError('A data inicial deve ser anterior ou igual à data final');
      return;
    }
    if (endDate > todayStr) {
      setDateError('A data final não pode ser futura');
      return;
    }
    setDateError('');
    onSearch({ addresses, startDate, endDate });
  }

  return (
    <form onSubmit={handleSubmit} className="bg-white rounded-lg border border-[#c2c7d1] p-5 space-y-4">

      {/* Textarea */}
      <div>
        <label htmlFor="bsf-addresses" className={labelClass}>
          Endereços das Carteiras
          <span className="ml-1 font-normal text-[#727780]">(um por linha ou separados por vírgula — máximo 10)</span>
        </label>
        <textarea
          id="bsf-addresses"
          value={raw}
          onChange={e => setRaw(e.target.value)}
          placeholder={`Cole os endereços aqui, por exemplo:\n0xAbc123...\nbc1qxy...\nAddr1...\n\nA rede de cada endereço é detectada automaticamente.`}
          rows={6}
          spellCheck={false}
          className={`${inputClass} font-[var(--font-jetbrains-mono)] resize-y`}
        />

        {/* Address preview */}
        {addresses.length > 0 && (
          <div className="mt-2 space-y-1.5">
            {addresses.slice(0, MAX).map((addr, i) => {
              const chains = detectBlockchains(addr);
              const unknown = chains.length === 0;
              return (
                <div key={i} className="flex items-center gap-2 text-xs">
                  <span className={`font-[var(--font-jetbrains-mono)] truncate max-w-[260px] ${unknown ? 'text-[#b45309]' : 'text-[#151c27]'}`}>
                    {addr.slice(0, 20)}…{addr.slice(-8)}
                  </span>
                  {unknown ? (
                    <span className="text-[#b45309]">formato não reconhecido</span>
                  ) : (
                    chains.map(c => {
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
                    })
                  )}
                </div>
              );
            })}
            {overLimit && (
              <p className="text-[#ba1a1a] text-xs font-medium">
                {addresses.length} endereços detectados — limite é 10. Remova {addresses.length - MAX}.
              </p>
            )}
          </div>
        )}
      </div>

      {/* Period presets + date inputs */}
      <div className="space-y-2">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs font-semibold text-[#42474f]">Período</span>
          {presets.map(p => {
            const active = startDate === p.start && endDate === p.end;
            return (
              <button
                key={p.label}
                type="button"
                onClick={() => applyPreset(p.start, p.end)}
                className={`px-2.5 py-0.5 rounded border text-xs font-medium transition-colors ${
                  active
                    ? 'bg-[#e7eefe] border-[#0f4c81] text-[#0f4c81]'
                    : 'bg-white border-[#c2c7d1] text-[#42474f] hover:border-[#0f4c81] hover:text-[#0f4c81] hover:bg-[#f0f3ff]'
                }`}
              >
                {p.label}
              </button>
            );
          })}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <input
              type="date"
              value={startDate}
              onChange={e => { setStartDate(e.target.value); setDateError(''); }}
              className={inputClass}
            />
          </div>
          <div>
            <input
              type="date"
              value={endDate}
              onChange={e => { setEndDate(e.target.value); setDateError(''); }}
              className={inputClass}
            />
          </div>
        </div>
        {dateError && <p className="text-[#ba1a1a] text-xs">{dateError}</p>}
      </div>

      <div className="flex items-center justify-between pt-1">
        <span className="text-xs text-[#727780]">
          {addresses.length === 0
            ? 'Nenhum endereço detectado'
            : `${Math.min(addresses.length, MAX)} endereço${addresses.length !== 1 ? 's' : ''} detectado${addresses.length !== 1 ? 's' : ''}`}
        </span>
        <button
          type="submit"
          disabled={isLoading || addresses.length === 0 || overLimit}
          className="bg-[#0f4c81] hover:bg-[#00355f] disabled:bg-[#0f4c81]/40 text-white font-semibold px-6 py-2 rounded text-sm transition-colors flex items-center gap-2"
        >
          {isLoading ? (
            <>
              <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              Buscando…
            </>
          ) : (
            addresses.length > 0 && !overLimit
              ? `Buscar ${addresses.length} Carteira${addresses.length !== 1 ? 's' : ''}`
              : 'Buscar Carteiras'
          )}
        </button>
      </div>
    </form>
  );
}
