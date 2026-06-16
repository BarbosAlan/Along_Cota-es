import { describe, it, expect, vi, afterEach } from 'vitest';
import { EtherscanAdapter } from '@/lib/blockchain/etherscan';
import type { BlockchainId } from '@/types';

const WALLET = '0xd8da6bf26964af9d7eed9e03e53415d37aa96045';
const OTHER  = '0xab5801a7d398351b8be11c439e05c5b3259aec9b';

const JAN15_TS = Math.floor(new Date('2024-01-15T12:00:00Z').getTime() / 1000);
const DEC23_TS = Math.floor(new Date('2023-12-01T12:00:00Z').getTime() / 1000);

function makeResponse(data: object) {
  const str = JSON.stringify(data);
  return {
    ok: true,
    status: 200,
    text: () => Promise.resolve(str),
    json: () => Promise.resolve(data),
  };
}

const BLOCK_START = { status: '1', result: '19000000' };
const BLOCK_END   = { status: '1', result: '19100000' };
const NO_TXS = { status: '0', message: 'No transactions found', result: '' };

function stubEtherscan(nativeTxs: object[], tokenTxs: object[] = []) {
  const nativeResp = nativeTxs.length > 0
    ? { status: '1', message: 'OK', result: nativeTxs }
    : NO_TXS;
  const tokenResp = tokenTxs.length > 0
    ? { status: '1', message: 'OK', result: tokenTxs }
    : NO_TXS;

  vi.stubGlobal('fetch', vi.fn()
    .mockResolvedValueOnce(makeResponse(BLOCK_START))
    .mockResolvedValueOnce(makeResponse(BLOCK_END))
    .mockResolvedValueOnce(makeResponse(nativeResp))
    .mockResolvedValueOnce(makeResponse(tokenResp))
  );
}

function makeNativeTx(overrides: Record<string, string> = {}) {
  return {
    hash: 'eth_tx1',
    timeStamp: JAN15_TS.toString(),
    from: OTHER,
    to: WALLET,
    value: '1000000000000000000', // 1 ETH in wei
    isError: '0',
    ...overrides,
  };
}

function makeTokenTx(overrides: Record<string, string> = {}) {
  return {
    hash: 'tok_tx1',
    timeStamp: JAN15_TS.toString(),
    from: OTHER,
    to: WALLET,
    value: '1000000',  // 1 USDC with 6 decimals
    tokenSymbol: 'USDC',
    tokenDecimal: '6',
    contractAddress: '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48',
    ...overrides,
  };
}

describe('EtherscanAdapter.getTransactions', () => {
  const adapter = new EtherscanAdapter({ apiKey: 'test-key' });
  const start = new Date('2024-01-01T00:00:00Z');
  const end   = new Date('2024-01-31T23:59:59Z');

  afterEach(() => vi.unstubAllGlobals());

  it('returns empty when no transactions found', async () => {
    stubEtherscan([]);
    const txs = await adapter.getTransactions(WALLET, start, end, 'ethereum');
    expect(txs).toHaveLength(0);
  });

  it('parses a native ETH receive', async () => {
    stubEtherscan([makeNativeTx()]);

    const txs = await adapter.getTransactions(WALLET, start, end, 'ethereum');

    expect(txs).toHaveLength(1);
    expect(txs[0].type).toBe('receive');
    expect(txs[0].assetSymbol).toBe('ETH');
    expect(txs[0].amount).toBe('1');
    expect(txs[0].txHash).toBe('eth_tx1');
    expect(txs[0].fromAddress).toBe(OTHER);
    expect(txs[0].toAddress).toBe(WALLET);
    expect(txs[0].sourceApi).toBe('etherscan');
  });

  it('parses a native ETH send', async () => {
    stubEtherscan([makeNativeTx({ from: WALLET, to: OTHER })]);

    const txs = await adapter.getTransactions(WALLET, start, end, 'ethereum');

    expect(txs).toHaveLength(1);
    expect(txs[0].type).toBe('send');
  });

  it('skips transactions with isError === "1"', async () => {
    stubEtherscan([makeNativeTx({ isError: '1' })]);
    const txs = await adapter.getTransactions(WALLET, start, end, 'ethereum');
    expect(txs).toHaveLength(0);
  });

  it('skips native transactions with value === "0"', async () => {
    stubEtherscan([makeNativeTx({ value: '0' })]);
    const txs = await adapter.getTransactions(WALLET, start, end, 'ethereum');
    expect(txs).toHaveLength(0);
  });

  it('skips native transactions outside the date range', async () => {
    stubEtherscan([makeNativeTx({ timeStamp: DEC23_TS.toString() })]);
    const txs = await adapter.getTransactions(WALLET, start, end, 'ethereum');
    expect(txs).toHaveLength(0);
  });

  it('parses an ERC-20 token receive', async () => {
    stubEtherscan([], [makeTokenTx()]);

    const txs = await adapter.getTransactions(WALLET, start, end, 'ethereum');

    expect(txs).toHaveLength(1);
    expect(txs[0].type).toBe('receive');
    expect(txs[0].assetSymbol).toBe('USDC');
    expect(txs[0].amount).toBe('1');
    expect(txs[0].assetAddress).toBe('0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48');
    expect(txs[0].sourceApi).toBe('etherscan');
  });

  it('uses POL as native symbol for Polygon', async () => {
    stubEtherscan([makeNativeTx()]);
    const txs = await adapter.getTransactions(WALLET, start, end, 'polygon');
    expect(txs[0].assetSymbol).toBe('POL');
  });

  it('uses BNB as native symbol for BNB Chain', async () => {
    stubEtherscan([makeNativeTx()]);
    const txs = await adapter.getTransactions(WALLET, start, end, 'bnb');
    expect(txs[0].assetSymbol).toBe('BNB');
  });

  it('throws for an unsupported chain', async () => {
    await expect(
      adapter.getTransactions(WALLET, start, end, 'bitcoin' as BlockchainId)
    ).rejects.toThrow('unsupported chain');
  });
});

describe('EtherscanAdapter.getTokenMetadata', () => {
  const adapter = new EtherscanAdapter({ apiKey: 'test-key' });
  const TOKEN_ADDR = '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48';

  afterEach(() => vi.unstubAllGlobals());

  function stubTokenInfo(data: object, ok = true, status = 200) {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce({
      ok, status,
      json: () => Promise.resolve(data),
    }));
  }

  it('returns token metadata when the API responds successfully', async () => {
    stubTokenInfo({ result: [{ symbol: 'USDC', tokenName: 'USD Coin', divisor: '6' }] });

    const meta = await adapter.getTokenMetadata(TOKEN_ADDR, 'ethereum');

    expect(meta).toBeDefined();
    expect(meta!.symbol).toBe('USDC');
    expect(meta!.name).toBe('USD Coin');
    expect(meta!.decimals).toBe(6);
    expect(meta!.tokenAddress).toBe(TOKEN_ADDR);
    expect(meta!.blockchain).toBe('ethereum');
    expect(meta!.sourceApi).toBe('etherscan');
  });

  it('returns undefined when result array is empty', async () => {
    stubTokenInfo({ result: [] });
    const meta = await adapter.getTokenMetadata(TOKEN_ADDR, 'ethereum');
    expect(meta).toBeUndefined();
  });

  it('returns undefined when the HTTP request fails', async () => {
    stubTokenInfo({}, false, 500);
    const meta = await adapter.getTokenMetadata(TOKEN_ADDR, 'ethereum');
    expect(meta).toBeUndefined();
  });

  it('returns undefined for unsupported chain', async () => {
    const meta = await adapter.getTokenMetadata(TOKEN_ADDR, 'bitcoin' as BlockchainId);
    expect(meta).toBeUndefined();
  });

  it('lowercases the tokenAddress in the returned metadata', async () => {
    stubTokenInfo({ result: [{ symbol: 'USDC', tokenName: 'USD Coin', divisor: '6' }] });
    const meta = await adapter.getTokenMetadata(TOKEN_ADDR.toUpperCase(), 'ethereum');
    expect(meta!.tokenAddress).toBe(TOKEN_ADDR.toLowerCase());
  });

  it('falls back to decimals=18 when divisor is missing', async () => {
    stubTokenInfo({ result: [{ symbol: 'TKN', tokenName: 'Token' }] }); // no divisor
    const meta = await adapter.getTokenMetadata(TOKEN_ADDR, 'ethereum');
    expect(meta!.decimals).toBe(18);
  });
});

describe('EtherscanAdapter metadata', () => {
  const adapter = new EtherscanAdapter({ apiKey: '' });

  it('supports all 6 EVM chains', () => {
    const chains = adapter.supportedChains;
    expect(chains).toContain('ethereum');
    expect(chains).toContain('polygon');
    expect(chains).toContain('bnb');
    expect(chains).toContain('arbitrum');
    expect(chains).toContain('base');
    expect(chains).toContain('optimism');
  });

  it('has a descriptive name', () => {
    expect(typeof adapter.name).toBe('string');
    expect(adapter.name.length).toBeGreaterThan(0);
  });
});
