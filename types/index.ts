export type BlockchainId =
  | 'ethereum'
  | 'polygon'
  | 'bitcoin'
  | 'solana'
  | 'tron'
  | 'terra'
  | 'cardano'
  | 'xrp'
  | 'lisk';

export type TransactionType = 'receive' | 'send' | 'swap' | 'fee' | 'unknown';

export type PriceSource = 'binance' | 'kraken' | 'coingecko' | 'dexscreener';

export type BlockchainApiSource =
  | 'etherscan'
  | 'blockstream'
  | 'helius'
  | 'trongrid'
  | 'terra_fcd'
  | 'koios'
  | 'ripple_data'
  | 'lisk_api';

export interface RawTransaction {
  txHash: string;
  date: Date;
  type: TransactionType;
  assetSymbol: string;
  assetAddress?: string;
  amount: string;
  fromAddress?: string;
  toAddress?: string;
  sourceApi: BlockchainApiSource;
}

export interface EnrichedTransaction extends RawTransaction {
  blockchain: BlockchainId;
  walletAddress: string;
  priceUsd?: number;
  valueUsd?: number;
  ptax?: number;
  valueBrl?: number;
}

export interface HistoricalPrice {
  symbol: string;
  date: string;
  priceUsd: number;
  source: PriceSource;
}

export interface PtaxRate {
  date: string;
  usdBrl: number;
}

export interface TokenMeta {
  blockchain: BlockchainId;
  tokenAddress: string;
  symbol: string;
  name: string;
  decimals: number;
  sourceApi: string;
}

export interface SearchRequest {
  blockchain: BlockchainId;
  walletAddress: string;
  startDate: string;
  endDate: string;
  forceRefresh?: boolean;
}

export interface EnrichedTransactionRow {
  id: string;
  txHash: string;
  date: string;
  type: TransactionType;
  assetSymbol: string;
  amount: string;
  priceUsd: number | null;
  valueUsd: number | null;
  ptax: number | null;
  valueBrl: number | null;
  fromAddress: string | null;
  toAddress: string | null;
  sourceApi: string;
  blockchain: BlockchainId;
}

export interface TransactionSummary {
  total: number;
  totalReceived: number;
  totalSent: number;
  totalValueUsd: number | null;
  totalValueBrl: number | null;
}

export interface SearchResponse {
  searchLogId: string;
  transactions: EnrichedTransactionRow[];
  summary: TransactionSummary;
  fromCache: boolean;
  warnings: string[];
}

export interface ExportRequest {
  transactions: EnrichedTransactionRow[];
  format: 'xlsx' | 'csv';
  walletAddress: string;
}

export interface QuoteRow {
  date: string;
  symbol: string;
  priceUsd: number | null;
  ptax: number | null;
  priceBrl: number | null;
  priceSource: string | null;
}

export interface QuotesResponse {
  symbol: string;
  rows: QuoteRow[];
}

export interface BlockchainAdapterConfig {
  apiKey?: string;
  baseUrl?: string;
  network?: string;
}

export interface DashboardData {
  transactions: {
    total: number;
    received: number;
    sent: number;
    totalValueBrl: number | null;
    totalValueUsd: number | null;
    byBlockchain: { blockchain: string; count: number }[];
  };
  wallets: { total: number };
  quotes: {
    total: number;
    uniqueSymbols: number;
    bySource: { source: string; count: number }[];
  };
  ptax: {
    latest: number | null;
    date: string | null;
    totalCached: number;
  };
  recentSearches: {
    id: string;
    blockchain: string;
    walletAddress: string;
    totalTransactions: number | null;
    status: string;
    createdAt: string;
  }[];
}

export const BLOCKCHAIN_LABELS: Record<BlockchainId, string> = {
  ethereum: 'Ethereum',
  polygon: 'Polygon',
  bitcoin: 'Bitcoin',
  solana: 'Solana',
  tron: 'Tron',
  terra: 'Terra',
  cardano: 'Cardano',
  xrp: 'XRP',
  lisk: 'Lisk',
};

export interface HistoryLog {
  id: string;
  blockchain: string;
  walletAddress: string;
  startDate: string;
  endDate: string;
  status: string;
  totalTransactions: number | null;
  errorMessage: string | null;
  createdAt: string;
}

export interface BatchWalletResult {
  address: string;
  chains: string[];
  status: 'success' | 'error';
  transactions: EnrichedTransactionRow[];
  summary: TransactionSummary;
  fromCache: boolean;
  warnings: string[];
  error?: string;
}

export interface BatchResponse {
  results: BatchWalletResult[];
  combined: {
    totalAddresses: number;
    successCount: number;
    errorCount: number;
    totalTransactions: number;
    totalValueBrl: number | null;
    totalValueUsd: number | null;
  };
}

export const BLOCKCHAIN_EXPLORERS: Record<BlockchainId, string> = {
  ethereum: 'https://etherscan.io/tx/',
  polygon: 'https://polygonscan.com/tx/',
  bitcoin: 'https://blockstream.info/tx/',
  solana: 'https://solscan.io/tx/',
  tron: 'https://tronscan.org/#/transaction/',
  terra: 'https://finder.terra.money/mainnet/tx/',
  cardano: 'https://cardanoscan.io/transaction/',
  xrp: 'https://xrpscan.com/tx/',
  lisk: 'https://lisk.observer/transactions/',
};
