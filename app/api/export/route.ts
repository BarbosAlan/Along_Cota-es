import { NextRequest, NextResponse } from 'next/server';
import { generateExcel, generateCsv, generateQuotesExcel, generateQuotesCsv } from '@/lib/export/excel';
import { exportRequestSchema, quotesExportRequestSchema } from '@/lib/validation';
import { format } from 'date-fns';

export async function POST(req: NextRequest): Promise<NextResponse> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const dateTag = format(new Date(), 'yyyy-MM-dd');

  // Check if this is a quotes export
  const quotesCheck = quotesExportRequestSchema.safeParse(body);
  if (quotesCheck.success) {
    const { quotes, symbol, format: fmt } = quotesCheck.data;

    if (fmt === 'xlsx') {
      const buffer = await generateQuotesExcel(quotes, symbol);
      return new NextResponse(new Uint8Array(buffer), {
        status: 200,
        headers: {
          'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'Content-Disposition': `attachment; filename="cotacoes_${symbol}_${dateTag}.xlsx"`,
        },
      });
    }

    const csv = generateQuotesCsv(quotes);
    return new NextResponse(csv, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="cotacoes_${symbol}_${dateTag}.csv"`,
      },
    });
  }

  // Transactions export
  const parsed = exportRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'VALIDATION_ERROR', details: parsed.error.issues },
      { status: 400 }
    );
  }

  const { transactions, format: fmt, walletAddress } = parsed.data;
  const shortAddr = walletAddress.slice(0, 8);

  if (fmt === 'xlsx') {
    const buffer = await generateExcel(transactions, walletAddress);
    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="transacoes_${shortAddr}_${dateTag}.xlsx"`,
      },
    });
  }

  const csv = generateCsv(transactions);
  return new NextResponse(csv, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="transacoes_${shortAddr}_${dateTag}.csv"`,
    },
  });
}
