'use client';

import type { QuoteRow } from '@/types';

interface QuotesTableProps {
  symbol: string;
  rows: QuoteRow[];
}

function fmt(n: number | null, decimals = 2): string {
  if (n === null) return '—';
  return n.toLocaleString('pt-BR', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

function fmtDate(d: string): string {
  const [y, m, day] = d.split('-');
  return `${day}/${m}/${y}`;
}

export function QuotesTable({ symbol, rows }: QuotesTableProps) {
  const withPrice = rows.filter(r => r.priceUsd !== null);
  const withBrl = rows.filter(r => r.priceBrl !== null);
  const minUsd = withPrice.length ? Math.min(...withPrice.map(r => r.priceUsd!)) : null;
  const maxUsd = withPrice.length ? Math.max(...withPrice.map(r => r.priceUsd!)) : null;
  const avgBrl = withBrl.length
    ? withBrl.reduce((s, r) => s + r.priceBrl!, 0) / withBrl.length
    : null;

  return (
    <div className="space-y-4">
      {/* Stats band */}
      <div className="bg-white rounded-lg border border-[#c2c7d1] grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 divide-y md:divide-y-0 md:divide-x divide-[#c2c7d1]">
        {[
          { label: 'Símbolo', value: symbol,                                         accent: false },
          { label: 'Dias',    value: rows.length.toString(),                         accent: false },
          { label: 'Mínimo',  value: minUsd !== null ? `US$ ${fmt(minUsd, 2)}` : '—', accent: false },
          { label: 'Máximo',  value: maxUsd !== null ? `US$ ${fmt(maxUsd, 2)}` : '—', accent: false },
          { label: 'Média BRL', value: avgBrl !== null ? `R$ ${fmt(avgBrl, 2)}` : '—', accent: true },
        ].map(s => (
          <div key={s.label} className={`px-5 py-4 ${s.accent ? 'bg-[#f0f6ff]' : ''}`}>
            <p className="text-[10px] font-semibold uppercase tracking-widest text-[#727780] mb-1">{s.label}</p>
            <p className={`font-bold leading-none tabular-nums font-[var(--font-jetbrains-mono)] ${s.accent ? 'text-[#0f4c81] text-2xl' : 'text-[#151c27] text-xl'}`}>
              {s.value}
            </p>
            {s.accent && (
              <p className="text-[9px] font-semibold uppercase tracking-widest text-[#0f4c81]/40 mt-1.5">via PTAX · BCB</p>
            )}
          </div>
        ))}
      </div>

      {/* Table */}
      <div className="bg-white rounded-lg border border-[#c2c7d1] overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-[#f0f3ff] border-b border-[#c2c7d1]">
                {[
                  ['Data',       false],
                  ['Preço USD',  true],
                  ['PTAX',       true],
                  ['Preço BRL',  true],
                  ['Fonte',      false],
                ].map(([h, right]) => (
                  <th
                    key={h as string}
                    className={`px-4 py-3 text-[10px] font-semibold uppercase tracking-widest text-[#42474f] ${right ? 'text-right' : 'text-left'}`}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => (
                <tr
                  key={row.date}
                  className={`border-b border-[#e7eefe] hover:bg-[#f0f3ff] transition-colors ${
                    i % 2 === 0 ? 'bg-white' : 'bg-[#f9f9ff]'
                  }`}
                >
                  <td className="px-4 py-2.5 font-[var(--font-jetbrains-mono)] text-xs text-[#151c27]">
                    {fmtDate(row.date)}
                  </td>
                  <td className="px-4 py-2.5 text-right font-[var(--font-jetbrains-mono)] text-xs text-[#151c27] tabular-nums">
                    {row.priceUsd !== null ? `US$ ${fmt(row.priceUsd, 6)}` : '—'}
                  </td>
                  <td className="px-4 py-2.5 text-right font-[var(--font-jetbrains-mono)] text-xs text-[#42474f] tabular-nums">
                    {fmt(row.ptax, 4)}
                  </td>
                  <td className="px-4 py-2.5 text-right font-[var(--font-jetbrains-mono)] text-xs font-semibold text-[#0f4c81] tabular-nums">
                    {row.priceBrl !== null ? `R$ ${fmt(row.priceBrl, 6)}` : '—'}
                  </td>
                  <td className="px-4 py-2.5 text-[#727780] text-xs">{row.priceSource ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
