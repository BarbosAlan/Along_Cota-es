/**
 * Diagnoses corrupted quote data in the DB.
 * Usage: node scripts/diagnose-quotes.mjs
 */

import pg from 'pg';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dir = dirname(fileURLToPath(import.meta.url));

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
          (val.startsWith("'") && val.endsWith("'"))) val = val.slice(1, -1);
      env[key] = val;
    }
    return env;
  } catch { return {}; }
}

const localEnv = parseEnvFile(join(__dir, '..', '.env'));
const DATABASE_URL = process.env.DIRECT_DATABASE_URL || localEnv.DIRECT_DATABASE_URL
                  || process.env.DATABASE_URL         || localEnv.DATABASE_URL;

const pool = new pg.Pool({
  connectionString: DATABASE_URL,
  ssl: DATABASE_URL.includes('sslmode=require') ? { rejectUnauthorized: false } : false,
  max: 1,
});

async function main() {
  // 1. SHIB — ver preços reais com precisão total
  console.log('\n=== SHIB — preços reais (sem arredondamento) ===');
  const { rows: shib } = await pool.query(`
    SELECT quote_date::text, price_usd::text, price_brl::text, source_api
    FROM quotes WHERE symbol = 'SHIB'
    ORDER BY quote_date LIMIT 10
  `);
  for (const r of shib) console.log(`  ${r.quote_date}: $${r.price_usd} (${r.source_api})`);

  // 2. TRX — ver os 18 dias com preço suspeito ~0.11262
  console.log('\n=== TRX — dias com price entre 0.112 e 0.114 ===');
  const { rows: trx } = await pool.query(`
    SELECT quote_date::text, price_usd::text, source_api
    FROM quotes
    WHERE symbol = 'TRX' AND price_usd BETWEEN 0.112 AND 0.114
    ORDER BY quote_date
  `);
  for (const r of trx) console.log(`  ${r.quote_date}: $${r.price_usd} (${r.source_api})`);

  // 3. Verificar se há preços duplicados suspeitos — mesmo valor em símbolos diferentes no mesmo dia
  console.log('\n=== Preços idênticos em múltiplos símbolos no mesmo dia (possível corrupção) ===');
  const { rows: dups } = await pool.query(`
    SELECT q1.quote_date::text, q1.symbol AS sym1, q2.symbol AS sym2, q1.price_usd::text
    FROM quotes q1
    JOIN quotes q2
      ON q1.quote_date = q2.quote_date
     AND q1.price_usd = q2.price_usd
     AND q1.symbol < q2.symbol
     AND q1.symbol NOT IN ('USDT','USDC','BUSD','DAI')
     AND q2.symbol NOT IN ('USDT','USDC','BUSD','DAI')
    ORDER BY q1.quote_date, q1.symbol
    LIMIT 20
  `);
  if (dups.length === 0) {
    console.log('  ✓ Nenhum preço idêntico entre símbolos diferentes encontrado.');
  } else {
    for (const r of dups) console.log(`  ${r.quote_date}: ${r.sym1} = ${r.sym2} = $${r.price_usd}`);
  }

  // 4. Verificar NEAR, LTC, XRP no banco para 2024-06-01 (data do teste anterior)
  console.log('\n=== NEAR, LTC, XRP em 2024-06-01 ===');
  const { rows: spot } = await pool.query(`
    SELECT symbol, price_usd::text, source_api
    FROM quotes
    WHERE symbol IN ('NEAR','LTC','XRP') AND quote_date = '2024-06-01'
    ORDER BY symbol
  `);
  if (spot.length === 0) {
    console.log('  (sem registros — não cacheados para essa data)');
  } else {
    for (const r of spot) console.log(`  ${r.symbol}: $${r.price_usd} (${r.source_api})`);
  }

  await pool.end();
}

main().catch(err => { console.error('Fatal:', err.message); process.exit(1); });