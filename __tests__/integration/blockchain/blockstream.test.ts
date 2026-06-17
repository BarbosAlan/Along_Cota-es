import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { BlockstreamAdapter } from '@/lib/blockchain/blockstream';

const SATOSHI = 100_000_000;
const WALLET = 'bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq';
const OTHER  = 'bc1qc7slrfxkknqcq57opf48dtxg8n9fpdv5g64v8y';

const JAN15_TS = Math.floor(new Date('2024-01-15T12:00:00Z').getTime() / 1000);
const DEC23_TS = Math.floor(new Date('2023-12-01T12:00:00Z').getTime() / 1000);
const FEB24_TS = Math.floor(new Date('2024-02-10T12:00:00Z').getTime() / 1000);

function makeTx({
  txid,
  blockTime,
  inputs = [] as string[],
  outputs = [] as { addr: string; value: number }[],
  confirmed = true,
}: {
  txid: string;
  blockTime: number;
  inputs?: string[];
  outputs?: { addr: string; value: number }[];
  confirmed?: boolean;
}) {
  return {
    txid,
    status: { confirmed, block_time: confirmed ? blockTime : undefined },
    vin: inputs.map(addr => ({ prevout: { scriptpubkey_address: addr, value: 0 } })),
    vout: outputs.map(({ addr, value }) => ({ scriptpubkey_address: addr, value })),
  };
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

describe('BlockstreamAdapter.getTransactions', () => {
  const adapter = new BlockstreamAdapter();
  const start = new Date('2024-01-01T00:00:00Z');
  const end   = new Date('2024-01-31T23:59:59Z');

  beforeEach(() => vi.useFakeTimers());
  afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

  async function run(wallet = WALLET) {
    const promise = adapter.getTransactions(wallet, start, end, 'bitcoin');
    await vi.runAllTimersAsync();
    return await promise;
  }

  it('returns empty array when no transactions', async () => {
    stubFetch([[]]);
    expect(await run()).toHaveLength(0);
  });

  it('parses a receive transaction', async () => {
    const tx = makeTx({
      txid: 'recv1',
      blockTime: JAN15_TS,
      inputs: [OTHER],
      outputs: [{ addr: WALLET, value: SATOSHI * 1.5 }],
    });
    stubFetch([[tx]]);

    const txs = await run();

    expect(txs).toHaveLength(1);
    expect(txs[0].type).toBe('receive');
    expect(txs[0].amount).toBe('1.50000000');
    expect(txs[0].assetSymbol).toBe('BTC');
    expect(txs[0].txHash).toBe('recv1');
    expect(txs[0].sourceApi).toBe('blockstream');
    expect(txs[0].fromAddress).toBe(OTHER);
  });

  it('parses a send transaction — change output excluded from amount', async () => {
    const tx = makeTx({
      txid: 'send1',
      blockTime: JAN15_TS,
      inputs: [WALLET],
      outputs: [
        { addr: OTHER,  value: SATOSHI },       // sent amount
        { addr: WALLET, value: SATOSHI * 0.1 }, // change back
      ],
    });
    stubFetch([[tx]]);

    const txs = await run();

    expect(txs).toHaveLength(1);
    expect(txs[0].type).toBe('send');
    expect(txs[0].amount).toBe('1.00000000');
    expect(txs[0].toAddress).toBe(OTHER);
  });

  it('skips unconfirmed transactions', async () => {
    const tx = makeTx({
      txid: 'unconf1',
      blockTime: JAN15_TS,
      confirmed: false,
      inputs: [OTHER],
      outputs: [{ addr: WALLET, value: SATOSHI }],
    });
    stubFetch([[tx]]);
    expect(await run()).toHaveLength(0);
  });

  it('stops early on transactions before startDate', async () => {
    const tx = makeTx({
      txid: 'old1',
      blockTime: DEC23_TS,
      inputs: [OTHER],
      outputs: [{ addr: WALLET, value: SATOSHI }],
    });
    stubFetch([[tx]]);
    expect(await run()).toHaveLength(0);
  });

  it('skips transactions after endDate', async () => {
    const tx = makeTx({
      txid: 'future1',
      blockTime: FEB24_TS,
      inputs: [OTHER],
      outputs: [{ addr: WALLET, value: SATOSHI }],
    });
    stubFetch([[tx]]);
    expect(await run()).toHaveLength(0);
  });

  it('skips transactions where wallet-relevant amount is zero', async () => {
    // All outputs go back to the sending wallet → sent amount = 0
    const tx = makeTx({
      txid: 'zero1',
      blockTime: JAN15_TS,
      inputs: [WALLET],
      outputs: [{ addr: WALLET, value: SATOSHI }],
    });
    stubFetch([[tx]]);
    expect(await run()).toHaveLength(0);
  });

  it('paginates when first page is full (25 items)', async () => {
    const page1 = Array.from({ length: 25 }, (_, i) =>
      makeTx({
        txid: `p1tx${i}`,
        blockTime: JAN15_TS,
        inputs: [OTHER],
        outputs: [{ addr: WALLET, value: SATOSHI }],
      })
    );
    const page2 = [
      makeTx({ txid: 'p2tx0', blockTime: JAN15_TS, inputs: [OTHER], outputs: [{ addr: WALLET, value: SATOSHI }] }),
    ];
    const fetchMock = stubFetch([page1, page2]);

    const txs = await run();

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(txs).toHaveLength(26);
    const secondUrl = fetchMock.mock.calls[1][0] as string;
    expect(secondUrl).toContain('/txs/chain/p1tx24');
  });
});

describe('BlockstreamAdapter metadata', () => {
  const adapter = new BlockstreamAdapter();

  it('declares bitcoin as supported chain', () => {
    expect(adapter.supportedChains).toContain('bitcoin');
  });

  it('has a descriptive name', () => {
    expect(typeof adapter.name).toBe('string');
    expect(adapter.name.length).toBeGreaterThan(0);
  });
});
