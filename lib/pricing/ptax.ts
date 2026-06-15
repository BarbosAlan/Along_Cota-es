import { db } from '@/lib/db';
import { PtaxNotFoundError, fetchWithTimeout } from '@/lib/errors';
import { parseISO, subDays, format } from 'date-fns';
import { isWeekend } from '@/lib/utils/date';
import type { PtaxRate } from '@/types';

const PTAX_BASE_URL =
  'https://olinda.bcb.gov.br/olinda/service/PTAX/version/v1/odata';

async function fetchPtaxFromApi(date: Date): Promise<number | null> {
  // PTAX API requires MM-DD-YYYY format
  const formatted = format(date, 'MM-dd-yyyy');

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
  let current = parseISO(date);

  for (let attempts = 0; attempts < 10; attempts++) {
    // Skip weekends
    while (isWeekend(current)) {
      current = subDays(current, 1);
    }

    const dateKey = new Date(
      Date.UTC(current.getFullYear(), current.getMonth(), current.getDate())
    );

    // Check DB cache (findFirst avoids Prisma 7 named-constraint requirement)
    const cached = await db.ptaxRate.findFirst({
      where: { quoteDate: dateKey },
    });

    if (cached) {
      return {
        date: format(current, 'yyyy-MM-dd'),
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

      return { date: format(current, 'yyyy-MM-dd'), usdBrl: rate };
    }

    // No rate found for this day — try previous day
    current = subDays(current, 1);
  }

  throw new PtaxNotFoundError(date);
}
