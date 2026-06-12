import type { BlockchainId } from '@/types';

const LOWERCASE_CHAINS = new Set<BlockchainId>(['ethereum', 'polygon', 'tron']);

export function normalizeAddress(address: string, blockchain: BlockchainId): string {
  return LOWERCASE_CHAINS.has(blockchain) ? address.toLowerCase() : address;
}

export function detectBlockchains(address: string): BlockchainId[] {
  const addr = address.trim();
  if (!addr) return [];

  // EVM: Ethereum and Polygon share the same address format
  if (/^0x[0-9a-fA-F]{40}$/.test(addr)) return ['ethereum', 'polygon'];

  // Bitcoin: P2PKH (1...), P2SH (3...), Bech32 (bc1...)
  if (/^[13][1-9A-HJ-NP-Za-km-z]{24,33}$/.test(addr)) return ['bitcoin'];
  if (/^bc1[a-z0-9]{6,87}$/.test(addr)) return ['bitcoin'];

  // Tron: T followed by 33 base58 chars
  if (/^T[1-9A-HJ-NP-Za-km-z]{33}$/.test(addr)) return ['tron'];

  // Terra 2.0: terra1 bech32
  if (/^terra1[a-z0-9]{38,60}$/.test(addr)) return ['terra'];

  // Cardano: addr1 mainnet bech32
  if (/^addr1[a-z0-9]{50,}$/.test(addr)) return ['cardano'];

  // XRP: starts with r, base58, 25–34 chars
  if (/^r[1-9A-HJ-NP-Za-km-z]{24,34}$/.test(addr)) return ['xrp'];

  // Lisk: lsk + 38 base32 lowercase chars
  if (/^lsk[a-z2-9]{38}$/.test(addr)) return ['lisk'];

  // Solana: base58, 32–44 chars (broad — must be last)
  if (/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(addr)) return ['solana'];

  return [];
}
