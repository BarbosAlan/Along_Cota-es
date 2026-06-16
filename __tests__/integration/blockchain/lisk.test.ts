import { describe, it, expect, vi, afterEach } from 'vitest';
import { LiskAdapter } from '@/lib/blockchain/lisk';

const WALLET = 'lskdxc4ta5j43jp9ro3f8zqbxta9fn6jwzjucw64y';
const OTHER  = 'lskqozpc5dawvd98s8e8yenkp5cqzrvsejaned43d';

const NATIVE_TOKEN_ID = '0400000000000000';
const JAN15_TS  = Math.floor(new Date('2024-01-15T12:00:00Z').getTime() / 1000);
const DEC23_TS  = Math.floor(new Date('2023-12-01T12:00:00Z').getTime() / 1000);
const FEB24_TS  = Math.floor(new Date('2024-02-10T12:00:00Z').getTime() / 1000);

function makeTx({
  id,
  timestamp,
  sender,
  recipient,
  amount,
  tokenID = NATIVE_TOKEN_ID,
}: {
  id: string;
  timestamp: number;
  sender: string;
  recipient: string;
  amount: string;
  tokenID?: string;
}) {
  return {
    id,
    moduleCommand: 'token:transfer',
    executionStatus: 'successful',
    block: { timestamp },
    sender: { address: sender },
    params: { recipientAddress: recipient, amount, tokenID },
  };
}

function stubFetch(responses: object[]) {
  const mock = vi.fn();
  for (const res of responses) {
    mock.mockResolvedValueOnce({ ok: true, status: 200, json: () => Promise.resolve(res) });
  }
  vi.stubGlobal('fetch', mock);
  return mock;
}

function makePage(txs: object[], total?: number) {
  return {
    data: txs,
    meta: { total: total ?? txs.length, count: txs.length, offset: 0 },
  };
}

describe('LiskAdapter.getTransactions', () => {
  const adapter = new LiskAdapter();
  const start = new Date('2024-01-01T00:00:00Z');
  const end   = new Date('2024-01-31T23:59:59Z');

  afterEach(() => vi.unstubAllGlobals());

  it('returns empty array when no transactions', async () => {
    stubFetch([makePage([])]);
    const txs = await adapter.getTransactions(WALLET, start, end, 'lisk');
    expect(txs).toHaveLength(0);
  });

  it('parses an LSK receive', async () => {
    const tx = makeTx({ id: 'lsktx1', timestamp: JAN15_TS, sender: OTHER, recipient: WALLET, amount: '100000000' });
    stubFetch([makePage([tx])]);

    const txs = await adapter.getTransactions(WALLET, start, end, 'lisk');

    expect(txs).toHaveLength(1);
    expect(txs[0].type).toBe('receive');
    expect(txs[0].assetSymbol).toBe('LSK');
    expect(txs[0].amount).toBe('1');
    expect(txs[0].txHash).toBe('lsktx1');
    expect(txs[0].fromAddress).toBe(OTHER);
    expect(txs[0].toAddress).toBe(WALLET);
    expect(txs[0].sourceApi).toBe('lisk_api');
  });

  it('parses an LSK send', async () => {
    const tx = makeTx({ id: 'lsktx2', timestamp: JAN15_TS, sender: WALLET, recipient: OTHER, amount: '100000000' });
    stubFetch([makePage([tx])]);

    const txs = await adapter.getTransactions(WALLET, start, end, 'lisk');

    expect(txs).toHaveLength(1);
    expect(txs[0].type).toBe('send');
  });

  it('skips transactions with amount === "0"', async () => {
    const tx = makeTx({ id: 'zerotx', timestamp: JAN15_TS, sender: OTHER, recipient: WALLET, amount: '0' });
    stubFetch([makePage([tx])]);
    const txs = await adapter.getTransactions(WALLET, start, end, 'lisk');
    expect(txs).toHaveLength(0);
  });

  it('skips transactions before startDate', async () => {
    const tx = makeTx({ id: 'oldtx', timestamp: DEC23_TS, sender: OTHER, recipient: WALLET, amount: '100000000' });
    stubFetch([makePage([tx])]);
    const txs = await adapter.getTransactions(WALLET, start, end, 'lisk');
    expect(txs).toHaveLength(0);
  });

  it('skips transactions after endDate', async () => {
    const tx = makeTx({ id: 'futuretx', timestamp: FEB24_TS, sender: OTHER, recipient: WALLET, amount: '100000000' });
    stubFetch([makePage([tx])]);
    const txs = await adapter.getTransactions(WALLET, start, end, 'lisk');
    expect(txs).toHaveLength(0);
  });

  it('converts beddows to LSK correctly', async () => {
    const tx = makeTx({ id: 'convtx', timestamp: JAN15_TS, sender: OTHER, recipient: WALLET, amount: '150000000' });
    stubFetch([makePage([tx])]);

    const txs = await adapter.getTransactions(WALLET, start, end, 'lisk');
    expect(txs[0].amount).toBe('1.5');
  });

  it('uses UNKNOWN symbol for non-native token IDs', async () => {
    const tx = makeTx({
      id: 'tokentx',
      timestamp: JAN15_TS,
      sender: OTHER,
      recipient: WALLET,
      amount: '100000000',
      tokenID: '0500000000000001', // different from native
    });
    stubFetch([makePage([tx])]);

    const txs = await adapter.getTransactions(WALLET, start, end, 'lisk');
    expect(txs[0].assetSymbol).toBe('UNKNOWN');
  });

  it('paginates when total exceeds first page', async () => {
    const page1Txs = Array.from({ length: 100 }, (_, i) =>
      makeTx({ id: `p1tx${i}`, timestamp: JAN15_TS, sender: OTHER, recipient: WALLET, amount: '100000000' })
    );
    const page2Txs = [
      makeTx({ id: 'p2tx0', timestamp: JAN15_TS, sender: OTHER, recipient: WALLET, amount: '200000000' }),
    ];

    vi.useFakeTimers();
    stubFetch([
      { data: page1Txs, meta: { total: 101, count: 100, offset: 0 } },
      { data: page2Txs, meta: { total: 101, count: 1, offset: 100 } },
    ]);

    const promise = adapter.getTransactions(WALLET, start, end, 'lisk');
    await vi.runAllTimersAsync();
    const txs = await promise;
    vi.useRealTimers();

    expect(txs).toHaveLength(101);
  });
});

describe('LiskAdapter metadata', () => {
  const adapter = new LiskAdapter();

  it('declares lisk as supported chain', () => {
    expect(adapter.supportedChains).toContain('lisk');
  });

  it('has a descriptive name', () => {
    expect(typeof adapter.name).toBe('string');
    expect(adapter.name.length).toBeGreaterThan(0);
  });
});
