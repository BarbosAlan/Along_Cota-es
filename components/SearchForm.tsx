'use client';

import { useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { searchRequestSchema } from '@/lib/validation';
import { detectBlockchains } from '@/lib/utils/address';
import {
  format, subDays, subMonths, subYears,
  startOfMonth, endOfMonth, startOfYear, endOfYear,
} from 'date-fns';
import type { z } from 'zod';

type FormData = z.infer<typeof searchRequestSchema>;

interface SearchFormProps {
  onSearch: (data: FormData) => void;
  isLoading: boolean;
  defaultValues?: Partial<FormData>;
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
    { label: '7 dias',        start: fmt(subDays(today, 6)),                         end: fmt(today) },
    { label: '30 dias',       start: fmt(subDays(today, 29)),                        end: fmt(today) },
    { label: '3 meses',       start: fmt(subMonths(today, 3)),                       end: fmt(today) },
    { label: 'Este mês',      start: fmt(startOfMonth(today)),                       end: fmt(today) },
    { label: 'Mês ant.',      start: fmt(startOfMonth(subMonths(today, 1))),         end: fmt(endOfMonth(subMonths(today, 1))) },
    { label: String(prevYear),start: fmt(startOfYear(subYears(today, 1))),           end: fmt(endOfYear(subYears(today, 1))) },
    { label: String(currYear),start: fmt(startOfYear(today)),                        end: fmt(today) },
  ];
}

const inputClass =
  'w-full rounded border border-[#c2c7d1] bg-white px-3 py-2 text-sm text-[#151c27] placeholder:text-[#727780] focus:outline-none focus:ring-2 focus:ring-[#0f4c81] focus:border-transparent transition';

const labelClass = 'block text-xs font-semibold text-[#42474f] mb-1.5';

export function SearchForm({ onSearch, isLoading, defaultValues }: SearchFormProps) {
  const {
    register,
    handleSubmit,
    watch,
    setValue,
    control,
    formState: { errors },
  } = useForm<FormData>({
    resolver: zodResolver(searchRequestSchema),
    defaultValues,
  });

  const walletAddress = useWatch({ control, name: 'walletAddress', defaultValue: defaultValues?.walletAddress ?? '' });
  const watchedStart  = watch('startDate');
  const watchedEnd    = watch('endDate');
  const presets       = getDatePresets();

  const detectedChains = detectBlockchains(walletAddress ?? '');
  const hasAddress     = (walletAddress ?? '').trim().length >= 10;
  const unrecognized   = hasAddress && detectedChains.length === 0;

  return (
    <form
      onSubmit={handleSubmit(onSearch)}
      className="bg-white rounded-lg border border-[#c2c7d1] p-5 space-y-4"
    >
      {/* Wallet address */}
      <div>
        <label className={labelClass}>Endereço da Carteira</label>
        <input
          {...register('walletAddress')}
          type="text"
          placeholder="Cole o endereço da carteira…"
          autoComplete="off"
          spellCheck={false}
          className={`${inputClass} font-[var(--font-jetbrains-mono)]`}
        />

        {/* Detected chains badges */}
        {detectedChains.length > 0 && (
          <div className="flex items-center gap-2 mt-2">
            <span className="text-[10px] font-semibold uppercase tracking-widest text-[#727780]">
              Detectado:
            </span>
            {detectedChains.map(chain => {
              const info = CHAIN_INFO[chain];
              if (!info) return null;
              return (
                <span
                  key={chain}
                  className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold font-[var(--font-jetbrains-mono)]"
                  style={{ color: info.color, background: `${info.color}18`, border: `1px solid ${info.color}44` }}
                >
                  {info.abbr}
                </span>
              );
            })}
          </div>
        )}

        {unrecognized && (
          <p className="text-[#b45309] text-xs mt-1.5">
            Formato de endereço não reconhecido — verifique se está correto.
          </p>
        )}

        {errors.walletAddress && (
          <p className="text-[#ba1a1a] text-xs mt-1">{errors.walletAddress.message}</p>
        )}
      </div>

      {/* Period presets + date inputs */}
      <div className="space-y-2">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs font-semibold text-[#42474f]">Período</span>
          {presets.map(p => {
            const active = watchedStart === p.start && watchedEnd === p.end;
            return (
              <button
                key={p.label}
                type="button"
                onClick={() => {
                  setValue('startDate', p.start, { shouldValidate: true });
                  setValue('endDate',   p.end,   { shouldValidate: true });
                }}
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
            <input {...register('startDate')} type="date" className={inputClass} />
            {errors.startDate && <p className="text-[#ba1a1a] text-xs mt-1">{errors.startDate.message}</p>}
          </div>
          <div>
            <input {...register('endDate')} type="date" className={inputClass} />
            {errors.endDate && <p className="text-[#ba1a1a] text-xs mt-1">{errors.endDate.message}</p>}
          </div>
        </div>
      </div>

      <div className="flex justify-end pt-1">
        <button
          type="submit"
          disabled={isLoading}
          className="bg-[#0f4c81] hover:bg-[#00355f] disabled:bg-[#0f4c81]/40 text-white font-semibold px-6 py-2 rounded text-sm transition-colors flex items-center gap-2"
        >
          {isLoading ? (
            <>
              <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              Buscando…
            </>
          ) : 'Buscar Transações'}
        </button>
      </div>
    </form>
  );
}
