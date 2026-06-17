/**
 * Seeds the database with LUNA (Terra 2.0) daily prices for all of 2024.
 * Run from the project root:  node scripts/seed-luna-2024.mjs
 *
 * Why this exists: Binance.com is geo-blocked from Vercel's US-based servers.
 * This script runs locally (not geo-blocked) and pre-populates the quotes cache
 * so the Vercel function can serve 2024 data without calling Binance.
 */

import pg from 'pg';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dir = dirname(fileURLToPath(import.meta.url));

// Parse .env file
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
                  || process.env.DATABASE_URL       || localEnv.DATABASE_URL;

if (!DATABASE_URL) {
  console.error('DATABASE_URL not found in environment or .env file');
  process.exit(1);
}

const pool = new pg.Pool({
  connectionString: DATABASE_URL,
  ssl: DATABASE_URL.includes('sslmode=require') ? { rejectUnauthorized: false } : false,
  max: 1,
});

// Fetch LUNA daily close from Binance
async function getBinancePrice(dateStr) {
  const start = new Date(dateStr + 'T00:00:00Z').getTime();
  const end   = start + 86399999;
  const url   = `https://api.binance.com/api/v3/klines?symbol=LUNAUSDT&interval=1d&startTime=${start}&endTime=${end}&limit=1`;

  const res = await fetch(url);
  if (res.status === 400) return null; // pair not found
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Binance ${res.status}: ${body.slice(0, 120)}`);
  }
  const data = await res.json();
  if (!data.length) return null;
  return parseFloat(data[0][4]); // index 4 = close
}

// Fetch PTAX (USD→BRL) from BCB
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

// Generate all dates in a year
function getDates(startStr, endStr) {
  const dates = [];
  const current = new Date(startStr + 'T00:00:00Z');
  const end     = new Date(endStr   + 'T00:00:00Z');
  while (current <= end) {
    dates.push(current.toISOString().slice(0, 10));
    current.setUTCDate(current.getUTCDate() + 1);
  }
  return dates;
}

async function main() {
  const dates = getDates('2024-01-01', '2024-12-31');
  console.log(`Seeding ${dates.length} days of LUNA/PTAX for 2024...\n`);

  let inserted = 0, skipped = 0, failed = 0;

  for (const dateStr of dates) {
    try {
      // Check if already cached
      const { rows } = await pool.query(
        `SELECT price_usd FROM quotes WHERE symbol = 'LUNA' AND quote_date = $1`,
        [dateStr]
      );
      if (rows.length > 0) {
        process.stdout.write(`  ${dateStr}: cached ($${Number(rows[0].price_usd).toFixed(4)})\n`);
        skipped++;
        continue;
      }

      const priceUsd = await getBinancePrice(dateStr);
      if (priceUsd === null) {
        process.stdout.write(`  ${dateStr}: no data\n`);
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
        ['LUNA', dateStr, priceUsd, priceBrl]
      );

      process.stdout.write(
        `  ${dateStr}: $${priceUsd.toFixed(4)}` +
        (priceBrl ? ` = R$${priceBrl.toFixed(4)}` : '') + '\n'
      );
      inserted++;

      // Respect Binance rate limits (~10 req/s)
      await new Promise(r => setTimeout(r, 110));
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
