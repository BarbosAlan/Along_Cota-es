import { db } from '@/lib/db';
import { PtaxNotFoundError, fetchWithTimeout } from '@/lib/errors';
import { parseISO, subDays } from 'date-fns';
import { isWeekend } from '@/lib/utils/date';
import type { PtaxRate } from '@/types';

const PTAX_BASE_URL =
  'https://olinda.bcb.gov.br/olinda/service/PTAX/version/v1/odata';

async function fetchPtaxFromApi(date: Date): Promise<number | null> {
  // PTAX API requires MM-DD-YYYY format; use UTC components to avoid timezone offset
  const iso = date.toISOString().slice(0, 10);
  const [y, m, d] = iso.split('-');
  const formatted = `${m}-${d}-${y}`;

  // $orderby=dataHoraCotacao desc ensures we get the last bulletin of the day
  // (Fechamento), not the first (Abertura). The closing rate is what Receita Federal
  // requires for crypto tax calculations.
  const url =
    `${PTAX_BASE_URL}/ExchangeRateDate(moeda=@moeda,dataCotacao=@dataCotacao)` +
    `?@moeda='USD'&@dataCotacao='${formatted}'&$format=json&$select=cotacaoVenda&$orderby=dataHoraCotacao%20desc&$top=1`;

  const res = await fetchWithTimeout(url, { next: { revalidate: 0 } });
  if (!res.ok) return null;

  const data: { value?: { cotacaoVenda?: number }[] } = await res.json();
  if (!data.value?.length) return null;

  return data.value[0].cotacaoVenda ?? null;
}

export async function getPtax(date: string): Promise<PtaxRate> {
  // Force UTC midnight to avoid 1-day offset when server is in non-UTC timezone
  let current = parseISO(date + 'T00:00:00Z');

  for (let attempts = 0; attempts < 10; attempts++) {
    // Skip weekends
    while (isWeekend(current)) {
      current = subDays(current, 1);
    }

    const dateKey = new Date(
      Date.UTC(current.getUTCFullYear(), current.getUTCMonth(), current.getUTCDate())
    );

    // Check DB cache (findFirst avoids Prisma 7 named-constraint requirement)
    const cached = await db.ptaxRate.findFirst({
      where: { quoteDate: dateKey },
    });

    if (cached) {
      return {
        date: current.toISOString().slice(0, 10),
        usdBrl: Number(cached.usdBrl),
      };
    }

    // Fetch from Banco Central
    const rate = await fetchPtaxFromApi(current);

    if (rate !== null) {
      try {
        await db.ptaxRate.create({
          data: { quoteDate: dateKey, usdBrl: rate, sourceApi: 'bcb_ptax' },
        });
      } catch {
        // duplicate — record already exists, fine
      }

      return { date: current.toISOString().slice(0, 10), usdBrl: rate };
    }

    // No rate found for this day — try previous day
    current = subDays(current, 1);
  }

  throw new PtaxNotFoundError(date);
}
