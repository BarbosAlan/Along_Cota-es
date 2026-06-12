'use client';

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { quotesRequestSchema } from '@/lib/validation';
import {
  format, subDays, subMonths, subYears,
  startOfMonth, endOfMonth, startOfYear, endOfYear,
} from 'date-fns';
import type { z } from 'zod';

type FormData = z.infer<typeof quotesRequestSchema>;

interface QuotesFormProps {
  onSearch: (data: FormData) => void;
  isLoading: boolean;
}

// Coins shown as quick-pick chips
const TICKERS = [
  { symbol: 'BTC',   name: 'Bitcoin' },
  { symbol: 'ETH',   name: 'Ethereum' },
  { symbol: 'SOL',   name: 'Solana' },
  { symbol: 'BNB',   name: 'BNB' },
  { symbol: 'XRP',   name: 'XRP' },
  { symbol: 'ADA',   name: 'Cardano' },
  { symbol: 'TRX',   name: 'Tron' },
  { symbol: 'DOGE',  name: 'Dogecoin' },
  { symbol: 'AVAX',  name: 'Avalanche' },
  { symbol: 'MATIC', name: 'Polygon' },
  { symbol: 'LINK',  name: 'Chainlink' },
  { symbol: 'USDT',  name: 'Tether' },
  { symbol: 'USDC',  name: 'USD Coin' },
];

// Known symbols (symbol → display name) for immediate UI feedback
const KNOWN: Record<string, string> = {
  BTC: 'Bitcoin', ETH: 'Ethereum', BNB: 'BNB', SOL: 'Solana',
  ADA: 'Cardano', XRP: 'XRP', DOT: 'Polkadot', DOGE: 'Dogecoin',
  AVAX: 'Avalanche', MATIC: 'Polygon', POL: 'Polygon', LINK: 'Chainlink',
  UNI: 'Uniswap', ATOM: 'Cosmos', LTC: 'Litecoin', ETC: 'Ethereum Classic',
  XLM: 'Stellar', TRX: 'Tron', LUNA: 'Terra 2.0', LUNC: 'Terra Classic',
  LSK: 'Lisk', USDT: 'Tether', USDC: 'USD Coin', DAI: 'Dai',
  BUSD: 'BUSD', SHIB: 'Shiba Inu', NEAR: 'NEAR', FTM: 'Fantom',
  ALGO: 'Algorand', VET: 'VeChain', MANA: 'Decentraland', SAND: 'The Sandbox',
  AXS: 'Axie Infinity', AAVE: 'Aave', MKR: 'Maker', COMP: 'Compound',
  SNX: 'Synthetix', CRV: 'Curve', '1INCH': '1inch',
};

function getDatePresets() {
  const today = new Date();
  const fmt = (d: Date) => format(d, 'yyyy-MM-dd');
  const prevYear = today.getFullYear() - 1;
  const currYear = today.getFullYear();
  return [
    { label: '7 dias',         start: fmt(subDays(today, 6)),                          end: fmt(today) },
    { label: '30 dias',        start: fmt(subDays(today, 29)),                         end: fmt(today) },
    { label: '3 meses',        start: fmt(subMonths(today, 3)),                        end: fmt(today) },
    { label: 'Este mês',       start: fmt(startOfMonth(today)),                        end: fmt(today) },
    { label: 'Mês ant.',       start: fmt(startOfMonth(subMonths(today, 1))),          end: fmt(endOfMonth(subMonths(today, 1))) },
    { label: String(prevYear), start: fmt(startOfYear(subYears(today, 1))),            end: fmt(endOfYear(subYears(today, 1))) },
    { label: String(currYear), start: fmt(startOfYear(today)),                         end: fmt(today) },
  ];
}

const inputClass =
  'w-full rounded border border-[#c2c7d1] bg-white px-3 py-2 text-sm text-[#151c27] placeholder:text-[#727780] focus:outline-none focus:ring-2 focus:ring-[#0f4c81] focus:border-transparent transition';

const labelClass = 'block text-xs font-semibold text-[#42474f] mb-1.5';

export function QuotesForm({ onSearch, isLoading }: QuotesFormProps) {
  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors },
  } = useForm<FormData>({
    resolver: zodResolver(quotesRequestSchema),
  });

  const currentSymbol  = watch('symbol')?.toUpperCase().trim();
  const knownName      = currentSymbol ? KNOWN[currentSymbol] : undefined;
  const isStable       = ['USDT', 'USDC', 'BUSD', 'DAI', 'TUSD'].includes(currentSymbol ?? '');
  const symbolResolved = !!knownName;
  const symbolTyped    = (currentSymbol?.length ?? 0) >= 2;
  const watchedStart  = watch('startDate');
  const watchedEnd    = watch('endDate');
  const presets       = getDatePresets();

  return (
    <form
      onSubmit={handleSubmit(onSearch)}
      className="bg-white rounded-lg border border-[#c2c7d1] p-5 space-y-4"
    >
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {/* Symbol + ticker chips */}
        <div>
          <label className={labelClass}>Moeda / Token</label>
          <input
            {...register('symbol')}
            type="text"
            placeholder="Ex: BTC, ETH, PEPE…"
            className={`${inputClass} font-[var(--font-jetbrains-mono)] uppercase`}
          />
          {errors.symbol && (
            <p className="text-[#ba1a1a] text-xs mt-1">{errors.symbol.message}</p>
          )}
          {!errors.symbol && symbolTyped && (
            <p className={`text-xs mt-1 flex items-center gap-1 ${symbolResolved ? 'text-green-700' : 'text-[#727780]'}`}>
              {symbolResolved ? (
                <>
                  <svg className="w-3 h-3 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                  </svg>
                  {isStable ? `${knownName} — preço fixo USD 1,00` : knownName}
                </>
              ) : (
                <>
                  <svg className="w-3 h-3 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
                  </svg>
                  Símbolo não reconhecido localmente — será resolvido via CoinGecko
                </>
              )}
            </p>
          )}

          <div className="flex flex-wrap gap-1 mt-2">
            {TICKERS.map(t => {
              const active = currentSymbol === t.symbol;
              return (
                <button
                  key={t.symbol}
                  type="button"
                  title={t.name}
                  onClick={() => setValue('symbol', t.symbol)}
                  className={`px-2 py-0.5 rounded text-xs font-[var(--font-jetbrains-mono)] font-medium transition-all ${
                    active
                      ? 'bg-[#0f4c81] text-white'
                      : 'bg-[#e7eefe] text-[#0f4c81] hover:bg-[#d2e4ff]'
                  }`}
                >
                  {t.symbol}
                </button>
              );
            })}
          </div>
        </div>

        {/* Period: presets + date inputs spanning 2 cols */}
        <div className="sm:col-span-2 space-y-2">
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

          <div className="grid grid-cols-2 gap-4">
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
      </div>

      <div className="flex justify-end">
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
          ) : 'Buscar Cotações'}
        </button>
      </div>
    </form>
  );
}
