/**
 * Seeds the database with daily prices for any symbol from Binance.
 *
 * Usage:
 *   node scripts/seed-quotes.mjs <SYMBOL> [startDate] [endDate]
 *
 * Examples:
 *   node scripts/seed-quotes.mjs BTC 2024-01-01 2024-12-31
 *   node scripts/seed-quotes.mjs SOL 2024-01-01 2024-12-31
 *   node scripts/seed-quotes.mjs ETH 2023-01-01 2024-12-31
 *
 * Why this exists: Binance.com is geo-blocked from Vercel's US servers (HTTP 451).
 * Run locally (Brazil, not geo-blocked) to pre-populate the DB cache.
 */

import pg from 'pg';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dir = dirname(fileURLToPath(import.meta.url));

// --- CLI args ---
const [,, rawSymbol, startArg, endArg] = process.argv;

if (!rawSymbol) {
  console.error('Usage: node scripts/seed-quotes.mjs <SYMBOL> [startDate YYYY-MM-DD] [endDate YYYY-MM-DD]');
  process.exit(1);
}

const SYMBOL    = rawSymbol.toUpperCase();
const START     = startArg ?? '2024-01-01';
const END       = endArg   ?? '2024-12-31';

// Binance ticker overrides (symbol → Binance base ticker)
const BINANCE_TICKER = {
  // Binance renamed LUNA2 back to LUNA
  // Add overrides here only when the symbol differs from its Binance base ticker
};

const ticker = BINANCE_TICKER[SYMBOL] ?? SYMBOL;

// --- DB setup ---
function parseEnvFile(filePath) {
  try {
    const lines = readFileSync(filePath, 'utf-8').split('\n');
    const env = {};
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eq = trimmed.indexOf('=');
      if (eq === -1) continue;
      const key = trimmed.slice(0, eq).trim();
      let val = trimmed.slice(eq + 1).trim();
      if ((val.startsWith('"') && val.endsWith('"')) ||
          (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      env[key] = val;
    }
    return env;
  } catch {
    return {};
  }
}

const localEnv = parseEnvFile(join(__dir, '..', '.env'));
const DATABASE_URL = process.env.DIRECT_DATABASE_URL || localEnv.DIRECT_DATABASE_URL
                  || process.env.DATABASE_URL         || localEnv.DATABASE_URL;

if (!DATABASE_URL) {
  console.error('DATABASE_URL not found in environment or .env file');
  process.exit(1);
}

const pool = new pg.Pool({
  connectionString: DATABASE_URL,
  ssl: DATABASE_URL.includes('sslmode=require') ? { rejectUnauthorized: false } : false,
  max: 1,
});

// --- Binance ---
async function getBinancePrice(binanceTicker, dateStr) {
  const start = new Date(dateStr + 'T00:00:00Z').getTime();
  const end   = start + 86399999;
  const url   = `https://api.binance.com/api/v3/klines?symbol=${binanceTicker}USDT&interval=1d&startTime=${start}&endTime=${end}&limit=1`;

  const res = await fetch(url);
  if (res.status === 400) return null; // pair doesn't exist
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Binance ${res.status}: ${body.slice(0, 120)}`);
  }
  const data = await res.json();
  if (!data.length) return null;
  return parseFloat(data[0][4]); // index 4 = close price
}

// --- BCB PTAX ---
async function getPtax(dateStr) {
  const [y, m, d] = dateStr.split('-');
  const formatted = `${d}/${m}/${y}`;
  const url = `https://olinda.bcb.gov.br/olinda/servico/PTAX/versao/v1/odata/CotacaoDolarDia(dataCotacao=@dataCotacao)?@dataCotacao=%27${formatted}%27&%24format=json`;
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const json = await res.json();
    const rows = json.value;
    if (!rows?.length) return null;
    return parseFloat(rows[rows.length - 1].cotacaoVenda);
  } catch {
    return null;
  }
}

// --- Date range ---
function getDates(startStr, endStr) {
  const dates = [];
  const cur = new Date(startStr + 'T00:00:00Z');
  const end = new Date(endStr   + 'T00:00:00Z');
  while (cur <= end) {
    dates.push(cur.toISOString().slice(0, 10));
    cur.setUTCDate(cur.getUTCDate() + 1);
  }
  return dates;
}

// --- Main ---
async function main() {
  const dates = getDates(START, END);
  console.log(`\nSeeding ${dates.length} days for ${SYMBOL} (Binance: ${ticker}USDT)`);
  console.log(`Period: ${START} → ${END}\n`);

  // Verify the ticker exists on Binance before starting
  const testPrice = await getBinancePrice(ticker, START);
  if (testPrice === null) {
    console.error(`✗ ${ticker}USDT not found on Binance for ${START}. Check the symbol.`);
    await pool.end();
    process.exit(1);
  }
  console.log(`✓ Binance verified: ${ticker}USDT on ${START} = $${testPrice}\n`);

  let inserted = 0, skipped = 0, failed = 0;

  for (const dateStr of dates) {
    try {
      // Skip if already cached
      const { rows } = await pool.query(
        `SELECT price_usd FROM quotes WHERE symbol = $1 AND quote_date = $2`,
        [SYMBOL, dateStr]
      );
      if (rows.length > 0) {
        process.stdout.write(`  ${dateStr}: cached ($${Number(rows[0].price_usd).toFixed(4)})\n`);
        skipped++;
        continue;
      }

      const priceUsd = await getBinancePrice(ticker, dateStr);
      if (priceUsd === null) {
        process.stdout.write(`  ${dateStr}: no data (weekend/holiday with no candle)\n`);
        skipped++;
        continue;
      }

      const ptaxRate = await getPtax(dateStr);
      const priceBrl = ptaxRate ? priceUsd * ptaxRate : null;

      await pool.query(
        `INSERT INTO quotes (id, symbol, quote_date, price_usd, price_brl, source_api, created_at, updated_at)
         VALUES (gen_random_uuid(), $1, $2::date, $3, $4, 'binance', NOW(), NOW())
         ON CONFLICT (symbol, quote_date) DO UPDATE
           SET price_usd  = EXCLUDED.price_usd,
               price_brl  = EXCLUDED.price_brl,
               source_api = 'binance',
               updated_at = NOW()`,
        [SYMBOL, dateStr, priceUsd, priceBrl]
      );

      process.stdout.write(
        `  ${dateStr}: $${priceUsd.toFixed(4)}` +
        (priceBrl ? ` = R$${priceBrl.toFixed(4)}` : '') + '\n'
      );
      inserted++;

      await new Promise(r => setTimeout(r, 110)); // ~9 req/s, within Binance's 10/s limit
    } catch (err) {
      process.stdout.write(`  ${dateStr}: ERROR — ${err.message}\n`);
      failed++;
    }
  }

  console.log(`\n✓ Done — ${inserted} inserted, ${skipped} skipped, ${failed} failed`);
  await pool.end();
}

main().catch(err => {
  console.error('\nFatal:', err.message);
  process.exit(1);
});
