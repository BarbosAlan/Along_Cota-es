import type { BlockchainId } from '@/types';
import type { BlockchainAdapter } from './types';
import { EtherscanAdapter } from './etherscan';
import { BlockstreamAdapter } from './blockstream';
import { HeliusAdapter } from './helius';
import { TronGridAdapter } from './trongrid';
import { TerraAdapter } from './terra';
import { KoiosAdapter } from './koios';
import { XrpAdapter } from './xrp';
import { LiskAdapter } from './lisk';

function buildRegistry(): Map<BlockchainId, BlockchainAdapter> {
  const registry = new Map<BlockchainId, BlockchainAdapter>();

  // Ethereum & Polygon share the Etherscan V2 adapter (different chainid)
  const etherscan = new EtherscanAdapter({
    apiKey: process.env.ETHERSCAN_API_KEY,
  });
  registry.set('ethereum', etherscan);
  registry.set('polygon', etherscan);

  // Bitcoin via Blockstream (no API key needed)
  registry.set('bitcoin', new BlockstreamAdapter());

  // Solana via Helius
  registry.set('solana', new HeliusAdapter({
    apiKey: process.env.HELIUS_API_KEY,
  }));

  // Tron via TronGrid (no API key needed for basic usage)
  registry.set('tron', new TronGridAdapter());

  // Terra 2.0 (Phoenix) via FCD (no API key needed)
  registry.set('terra', new TerraAdapter());

  // Cardano via Koios (no API key needed)
  registry.set('cardano', new KoiosAdapter());

  // XRP via Ripple Data API v2 (no API key needed)
  registry.set('xrp', new XrpAdapter());

  // Lisk via Lisk Service API v3 (no API key needed)
  registry.set('lisk', new LiskAdapter());

  return registry;
}

// Built once at module load time (singleton)
const adapterRegistry = buildRegistry();

export function getAdapter(chain: BlockchainId): BlockchainAdapter {
  const adapter = adapterRegistry.get(chain);
  if (!adapter) {
    throw new Error(
      `No blockchain adapter registered for chain: ${chain}. ` +
      `Supported chains: ${[...adapterRegistry.keys()].join(', ')}`
    );
  }
  return adapter;
}

export function getSupportedChains(): BlockchainId[] {
  return [...adapterRegistry.keys()];
}
