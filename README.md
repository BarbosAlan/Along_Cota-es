# Along Cotações

Sistema web para consulta de transações em múltiplas blockchains com conversão automática para BRL.

## O que faz

- Busca transações por endereço de carteira em 8 blockchains
- Converte valores históricos para BRL via PTAX (Banco Central), Binance e Kraken
- Cotação manual de criptoativos por intervalo de data
- Exportação em XLSX e CSV
- Rate limiting por IP em todas as rotas de API
- Validação de variáveis de ambiente na inicialização

## Blockchains suportadas

| Blockchain | API usada | Chave necessária |
|------------|-----------|-----------------|
| Ethereum, Polygon | Etherscan | `ETHERSCAN_API_KEY` |
| Solana | Helius | `HELIUS_API_KEY` |
| Tron | TronGrid | `TRONGRID_API_KEY` |
| Bitcoin | Blockstream | — (pública) |
| XRP | XRPL Foundation | — (pública) |
| Cardano | Koios | — (pública) |
| Lisk | Lisk API | — (pública) |
| Terra Classic | FCD | — (pública) |

## Pré-requisitos

- Node.js 20+
- Conta no [Neon](https://neon.tech) (PostgreSQL serverless gratuito)

## Setup

### 1. Clonar e instalar

```bash
git clone https://github.com/BarbosAlan/Along_Cota-es.git
cd Along_Cota-es
npm install
```

### 2. Configurar variáveis de ambiente

```bash
cp .env.example .env
```

Edite o `.env` com seus valores:

| Variável | Obrigatória | Onde obter |
|----------|-------------|-----------|
| `DATABASE_URL` | Sim | Neon dashboard → Connection string (pooled) |
| `DIRECT_DATABASE_URL` | Sim | Neon dashboard → Connection string (direct) |
| `ETHERSCAN_API_KEY` | Não | [etherscan.io/apis](https://etherscan.io/apis) |
| `HELIUS_API_KEY` | Não | [helius.dev](https://helius.dev) |
| `TRONGRID_API_KEY` | Não | [tronscan.org](https://tronscan.org) → API |
| `COINGECKO_API_KEY` | Não | [coingecko.com/api](https://www.coingecko.com/en/api) |

> Sem `ETHERSCAN_API_KEY` o rate limit público do Etherscan é muito restrito (1 req/5s).  
> Sem `HELIUS_API_KEY` carteiras Solana não são suportadas.

### 3. Criar as tabelas no banco

```bash
npm run db:push
```

### 4. Rodar em desenvolvimento

```bash
npm run dev
```

Acesse [http://localhost:3000](http://localhost:3000).

---

## Scripts disponíveis

| Comando | O que faz |
|---------|-----------|
| `npm run dev` | Servidor de desenvolvimento com hot-reload |
| `npm run build` | Build de produção (inclui `prisma generate`) |
| `npm run start` | Inicia o servidor de produção |
| `npm run lint` | Lint com ESLint |
| `npm run db:push` | Aplica o schema Prisma sem migrations |
| `npm run db:migrate` | Cria e aplica uma migration |
| `npm run db:studio` | Abre o Prisma Studio (GUI do banco) |

---

## Estrutura do projeto

```
app/
  api/
    transactions/   # POST — busca e enriquece transações
    quotes/         # POST — cotação de criptoativo por período
    export/         # POST — gera XLSX ou CSV
    dashboard/      # GET  — estatísticas do banco
    history/        # GET  — histórico de buscas
    settings/       # GET/POST — status de APIs e limpeza de cache
    health/         # GET  — healthcheck
  page.tsx          # SPA principal (Dashboard / Transações / Cotações / Histórico / Configurações)
  layout.tsx
  error.tsx         # Error boundary de segmento
  global-error.tsx  # Error boundary do layout raiz

lib/
  blockchain/       # Adaptadores por chain (etherscan, helius, trongrid…)
  pricing/          # Waterfall de preços: PTAX → Binance → Kraken → CoinGecko
  normalize/        # Normaliza resposta bruta → tipo interno
  transactions.ts   # Pipeline de enriquecimento e cache
  export/           # Geração de XLSX/CSV com ExcelJS
  validation.ts     # Schemas Zod
  db.ts             # Cliente Prisma com adapter Neon

components/         # Componentes React reutilizáveis
proxy.ts            # Rate limiting por IP (substitui middleware.ts no Next.js 16)
instrumentation.ts  # Validação de env vars na startup do servidor
prisma/schema.prisma
prisma.config.ts    # Configuração do Prisma 7 (adapter pg)
```

---

## Rate limiting

Aplicado automaticamente a todos os endpoints:

| Rota | Método | Limite |
|------|--------|--------|
| `/api/transactions` | POST | 5 req / 60s por IP |
| `/api/quotes` | POST | 10 req / 60s por IP |
| `/api/export` | POST | 10 req / 60s por IP |
| `/api/settings` | POST | 5 req / 300s por IP |
| `/api/*` | GET | 60 req / 60s por IP |

Respostas 429 incluem o header `Retry-After` com os segundos restantes.

---

## Deploy

O projeto está pronto para deploy no Vercel:

1. Importe o repositório no [vercel.com](https://vercel.com)
2. Adicione as variáveis de ambiente no painel do projeto
3. O build roda `prisma generate && next build` automaticamente

Não é necessário configurar nada além das variáveis de ambiente.
