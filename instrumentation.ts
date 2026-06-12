export async function register() {
  const required: Record<string, string> = {
    DATABASE_URL: 'URL de conexão com o banco de dados (Neon/PostgreSQL)',
  };

  const optional: Record<string, string> = {
    ETHERSCAN_API_KEY: 'Ethereum & Polygon (sem chave = rate limit público)',
    HELIUS_API_KEY:    'Solana (sem chave = sem suporte a Solana)',
    COINGECKO_API_KEY: 'CoinGecko Pro (sem chave = tier gratuito, 30 req/min)',
    TRONGRID_API_KEY:  'Tron (sem chave = rate limit público)',
  };

  const missing = Object.entries(required).filter(([k]) => !process.env[k]);

  if (missing.length > 0) {
    const lines = missing.map(([k, desc]) => `  • ${k} — ${desc}`).join('\n');
    throw new Error(
      `\n\nVariáveis de ambiente obrigatórias ausentes:\n${lines}\n\nConfigure o arquivo .env e reinicie o servidor.\n`
    );
  }

  const missingOptional = Object.entries(optional).filter(([k]) => !process.env[k]);
  if (missingOptional.length > 0) {
    console.warn(
      '\n⚠ Variáveis opcionais não configuradas (funcionalidade reduzida):\n' +
      missingOptional.map(([k, desc]) => `  • ${k} — ${desc}`).join('\n') + '\n'
    );
  }
}
