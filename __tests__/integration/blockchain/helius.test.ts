import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { HeliusAdapter } from '@/lib/blockchain/helius';

const WALLET = 'DYw8jCTfwHNRJhhmFcbXvVDTqWMEVFBX6ZKUmG5CNSKH';
const OTHER  = '5Q544fKrFoe6tsEbD7S8EmxGTJYAKtTVhAW5Q5pge4j1';

const JAN15_TS  = Math.floor(new Date('2024-01-15T12:00:00Z').getTime() / 1000);
const DEC23_TS  = Math.floor(new Date('2023-12-01T12:00:00Z').getTime() / 1000);
const FEB24_TS  = Math.floor(new Date('2024-02-10T12:00:00Z').getTime() / 1000);

function makeTx({
  signature,
  timestamp,
  nativeTransfers = [] as { fromUserAccount?: string; toUserAccount?: string; amount?: number }[],
  tokenTransfers = [] as { fromUserAccount?: string; toUserAccount?: string; tokenAmount?: number; symbol?: string; mint?: string }[],
}: {
  signature: string;
  timestamp: number;
  nativeTransfers?: { fromUserAccount?: string; toUserAccount?: string; amount?: number }[];
  tokenTransfers?: { fromUserAccount?: string; toUserAccount?: string; tokenAmount?: number; symbol?: string; mint?: string }[];
}) {
  return { signature, timestamp, type: 'TRANSFER', nativeTransfers, tokenTransfers };
}

function stubFetch(pages: object[][]) {
  const mock = vi.fn();
  for (const page of pages) {
    mock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: () => Promise.resolve(page),
    });
  }
  vi.stubGlobal('fetch', mock);
  return mock;
}

describe('HeliusAdapter.getTransactions', () => {
  const adapter = new HeliusAdapter({ apiKey: 'test-key' });
  const start = new Date('2024-01-01T00:00:00Z');
  const end   = new Date('2024-01-31T23:59:59Z');

  beforeEach(() => vi.useFakeTimers());
  afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

  async function run(wallet = WALLET) {
    const promise = adapter.getTransactions(wallet, start, end, 'solana');
    await vi.runAllTimersAsync();
    return await promise;
  }

  it('returns empty array when no transactions', async () => {
    stubFetch([[]]);
    expect(await run()).toHaveLength(0);
  });

  it('parses a native SOL receive', async () => {
    const tx = makeTx({
      signature: 'sig1',
      timestamp: JAN15_TS,
      nativeTransfers: [{ fromUserAccount: OTHER, toUserAccount: WALLET, amount: 1.5e9 }],
    });
    stubFetch([[tx]]);

    const txs = await run();

    expect(txs).toHaveLength(1);
    expect(txs[0].type).toBe('receive');
    expect(txs[0].assetSymbol).toBe('SOL');
    expect(txs[0].amount).toBe('1.500000000');
    expect(txs[0].txHash).toBe('sig1');
    expect(txs[0].fromAddress).toBe(OTHER);
    expect(txs[0].toAddress).toBe(WALLET);
    expect(txs[0].sourceApi).toBe('helius');
  });

  it('parses a native SOL send', async () => {
    const tx = makeTx({
      signature: 'sig2',
      timestamp: JAN15_TS,
      nativeTransfers: [{ fromUserAccount: WALLET, toUserAccount: OTHER, amount: 1e9 }],
    });
    stubFetch([[tx]]);

    const txs = await run();

    expect(txs).toHaveLength(1);
    expect(txs[0].type).toBe('send');
    expect(txs[0].amount).toBe('1.000000000');
  });

  it('parses an SPL token receive', async () => {
    const tx = makeTx({
      signature: 'sig3',
      timestamp: JAN15_TS,
      tokenTransfers: [{
        fromUserAccount: OTHER,
        toUserAccount: WALLET,
        tokenAmount: 250.5,
        symbol: 'USDC',
        mint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
      }],
    });
    stubFetch([[tx]]);

    const txs = await run();

    expect(txs).toHaveLength(1);
    expect(txs[0].type).toBe('receive');
    expect(txs[0].assetSymbol).toBe('USDC');
    expect(txs[0].amount).toBe('250.5');
    expect(txs[0].assetAddress).toBe('epjfwdd5aufqssqem2qn1xzybapc8g4weggkzwytdt1v');
  });

  it('skips native transfers not involving the wallet', async () => {
    const tx = makeTx({
      signature: 'sig4',
      timestamp: JAN15_TS,
      nativeTransfers: [{ fromUserAccount: OTHER, toUserAccount: 'ThirdParty111', amount: 1e9 }],
    });
    stubFetch([[tx]]);
    expect(await run()).toHaveLength(0);
  });

  it('skips token transfers not involving the wallet', async () => {
    const tx = makeTx({
      signature: 'sig5',
      timestamp: JAN15_TS,
      tokenTransfers: [{ fromUserAccount: OTHER, toUserAccount: 'ThirdParty222', tokenAmount: 100, symbol: 'USDC' }],
    });
    stubFetch([[tx]]);
    expect(await run()).toHaveLength(0);
  });

  it('skips transactions before startDate', async () => {
    const tx = makeTx({
      signature: 'old1',
      timestamp: DEC23_TS,
      nativeTransfers: [{ fromUserAccount: OTHER, toUserAccount: WALLET, amount: 1e9 }],
    });
    stubFetch([[tx]]);
    expect(await run()).toHaveLength(0);
  });

  it('skips transactions after endDate', async () => {
    const tx = makeTx({
      signature: 'future1',
      timestamp: FEB24_TS,
      nativeTransfers: [{ fromUserAccount: OTHER, toUserAccount: WALLET, amount: 1e9 }],
    });
    stubFetch([[tx]]);
    expect(await run()).toHaveLength(0);
  });

  it('paginates when first page has 100 items', async () => {
    const page1 = Array.from({ length: 100 }, (_, i) =>
      makeTx({
        signature: `p1sig${i}`,
        timestamp: JAN15_TS,
        nativeTransfers: [{ fromUserAccount: OTHER, toUserAccount: WALLET, amount: 1e9 }],
      })
    );
    const page2 = [
      makeTx({ signature: 'p2sig0', timestamp: JAN15_TS,
        nativeTransfers: [{ fromUserAccount: OTHER, toUserAccount: WALLET, amount: 2e9 }] }),
    ];
    const fetchMock = stubFetch([page1, page2]);

    const txs = await run();

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(txs).toHaveLength(101);
    const secondUrl = fetchMock.mock.calls[1][0] as string;
    expect(secondUrl).toContain('before=p1sig99');
  });
});

describe('HeliusAdapter.getTokenMetadata', () => {
  const adapter = new HeliusAdapter({ apiKey: 'test-key' });
  const MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';

  afterEach(() => vi.unstubAllGlobals());

  function stubTokenMeta(data: object, ok = true) {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce({
      ok,
      status: ok ? 200 : 500,
      json: () => Promise.resolve(data),
    }));
  }

  it('returns token metadata when the API responds successfully', async () => {
    stubTokenMeta([{
      onChainMetadata: { metadata: { data: { symbol: 'USDC', name: 'USD Coin' } } },
    }]);

    const meta = await adapter.getTokenMetadata(MINT, 'solana');

    expect(meta).toBeDefined();
    expect(meta!.symbol).toBe('USDC');
    expect(meta!.name).toBe('USD Coin');
    expect(meta!.decimals).toBe(9);
    expect(meta!.tokenAddress).toBe(MINT.toLowerCase());
    expect(meta!.blockchain).toBe('solana');
    expect(meta!.sourceApi).toBe('helius');
  });

  it('returns undefined when onChainMetadata is absent', async () => {
    stubTokenMeta([{}]); // no onChainMetadata
    const meta = await adapter.getTokenMetadata(MINT, 'solana');
    expect(meta).toBeUndefined();
  });

  it('returns undefined when the response array is empty', async () => {
    stubTokenMeta([]);
    const meta = await adapter.getTokenMetadata(MINT, 'solana');
    expect(meta).toBeUndefined();
  });

  it('returns undefined when the HTTP request fails', async () => {
    stubTokenMeta({}, false);
    const meta = await adapter.getTokenMetadata(MINT, 'solana');
    expect(meta).toBeUndefined();
  });

  it('falls back to UNKNOWN symbol when symbol is absent', async () => {
    stubTokenMeta([{ onChainMetadata: { metadata: { data: { name: 'My Token' } } } }]);
    const meta = await adapter.getTokenMetadata(MINT, 'solana');
    expect(meta!.symbol).toBe('UNKNOWN');
  });

  it('falls back to Unknown Token name when name is absent', async () => {
    stubTokenMeta([{ onChainMetadata: { metadata: { data: { symbol: 'TKN' } } } }]);
    const meta = await adapter.getTokenMetadata(MINT, 'solana');
    expect(meta!.name).toBe('Unknown Token');
  });
});

describe('HeliusAdapter metadata', () => {
  const adapter = new HeliusAdapter({ apiKey: '' });

  it('declares solana as supported chain', () => {
    expect(adapter.supportedChains).toContain('solana');
  });

  it('has a descriptive name', () => {
    expect(typeof adapter.name).toBe('string');
    expect(adapter.name.length).toBeGreaterThan(0);
  });
});
