import { describe, it, expect } from 'vitest';
import { normalizeAddress, detectBlockchains } from '@/lib/utils/address';

describe('normalizeAddress', () => {
  const mixedCase = '0xABCDEF1234567890abcdef1234567890ABCDEF12';

  it.each(['ethereum', 'polygon', 'bnb', 'arbitrum', 'base', 'optimism'] as const)(
    'lowercases %s addresses',
    (chain) => {
      expect(normalizeAddress(mixedCase, chain)).toBe(mixedCase.toLowerCase());
    }
  );

  it.each(['bitcoin', 'solana', 'xrp', 'cardano', 'tron', 'lisk'] as const)(
    'preserves case for %s',
    (chain) => {
      const addr = 'SomeMixedCaseAddress123';
      expect(normalizeAddress(addr, chain)).toBe(addr);
    }
  );
});

describe('detectBlockchains', () => {
  it('detects all 6 EVM chains from 0x address', () => {
    const chains = detectBlockchains('0x742d35Cc6634C0532925a3b8D4C9F5e5b0d5a15C');
    expect(chains).toEqual(
      expect.arrayContaining(['ethereum', 'polygon', 'bnb', 'arbitrum', 'base', 'optimism'])
    );
    expect(chains).toHaveLength(6);
  });

  it('detects Bitcoin P2PKH (starts with 1)', () => {
    expect(detectBlockchains('1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa')).toEqual(['bitcoin']);
  });

  it('detects Bitcoin P2SH (starts with 3)', () => {
    expect(detectBlockchains('3J98t1WpEZ73CNmQviecrnyiWrnqRhWNLy')).toEqual(['bitcoin']);
  });

  it('detects Bitcoin Bech32 (starts with bc1)', () => {
    expect(detectBlockchains('bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq')).toEqual(['bitcoin']);
  });

  it('detects Tron addresses (starts with T)', () => {
    expect(detectBlockchains('TRWBqiqoFZysoAeyR1J35ibuyc8EvhUAoY')).toEqual(['tron']);
  });

  it('detects XRP addresses (starts with r)', () => {
    expect(detectBlockchains('rHb9CJAWyB4rj91VRWn96DkukG4bwdtyTh')).toEqual(['xrp']);
  });

  it('detects Terra addresses (starts with terra1)', () => {
    // 38 chars after "terra1" — matches the {38,60} requirement
    expect(
      detectBlockchains('terra1f4cr4sr5eulp8d0yelke7v00k49tzd9kx5jcww')
    ).toEqual(['terra']);
  });

  it('detects Cardano addresses (starts with addr1)', () => {
    expect(
      detectBlockchains('addr1qx2fxv2umyhttkxyxp8x0dlpdt3k6cwng5pxj3jhsydzer3n0d3vllmyqwsx5wktcd8cc3sq835lu7drv2xd2hv29xs2vflz3y')
    ).toEqual(['cardano']);
  });

  it('detects Lisk addresses (starts with lsk)', () => {
    expect(detectBlockchains('lskdxc4ta5j43jp9ro3f8zqbxta9fn6jwzjucw7yt')).toEqual(['lisk']);
  });

  it('detects Solana addresses (base58, 32-44 chars)', () => {
    // A Solana address that doesn't match any other pattern
    expect(detectBlockchains('DYw8jCTfwHNRJhhmFcbXvVDTqWMEVFBX6ZKUmG5CNSKH')).toEqual(['solana']);
  });

  it('returns empty array for empty string', () => {
    expect(detectBlockchains('')).toEqual([]);
  });

  it('returns empty array for whitespace only', () => {
    expect(detectBlockchains('   ')).toEqual([]);
  });

  it('returns empty array for clearly invalid address', () => {
    expect(detectBlockchains('notanaddress!')).toEqual([]);
  });
});
