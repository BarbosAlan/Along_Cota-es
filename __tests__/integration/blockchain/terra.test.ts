import { describe, it, expect, vi, afterEach } from 'vitest';
import { TerraAdapter } from '@/lib/blockchain/terra';

const WALLET = 'terra1x46rqay4d3cssq8gxxvqz8xt6nwlz4td20435';
const OTHER  = 'terra1qzx56nzjynwzl5n42fv8q8mtw0xtmcz8x8vd4n';
const JAN15  = '2024-01-15T12:00:00Z';
const DEC23  = '2023-12-01T12:00:00Z';
const FEB24  = '2024-02-10T12:00:00Z';

function makeTxResponse({
  txhash,
  timestamp,
  from,
  to,
  amount,
  code = 0,
}: {
  txhash: string;
  timestamp: string;
  from: string;
  to: string;
  amount: Array<{ denom: string; amount: string }>;
  code?: number;
}) {
  return {
    txhash,
    timestamp,
    ...(code !== 0 ? { code } : {}),
    tx: {
      body: {
        messages: [
          {
            '@type': '/cosmos.bank.v1beta1.MsgSend',
            from_address: from,
            to_address: to,
            amount,
          },
        ],
      },
    },
  };
}

function makeLcdResponse(txResponses: object[], total?: number) {
  return {
    tx_responses: txResponses,
    pagination: {
      next_key: null,
      total: (total ?? txResponses.length).toString(),
    },
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

// Each getTransactions call makes 2 HTTP requests (sent query + received query).
// stub order: 1st response = sent query, 2nd response = received query.

describe('TerraAdapter.getTransactions', () => {
  const adapter = new TerraAdapter();
  const start = new Date('2024-01-01T00:00:00Z');
  const end   = new Date('2024-01-31T23:59:59Z');

  afterEach(() => vi.unstubAllGlobals());

  it('returns empty array when no transactions', async () => {
    stubFetch([makeLcdResponse([]), makeLcdResponse([])]);
    const txs = await adapter.getTransactions(WALLET, start, end, 'terra');
    expect(txs).toHaveLength(0);
  });

  it('parses a LUNA send', async () => {
    const txResp = makeTxResponse({
      txhash: 'AAAA1111',
      timestamp: JAN15,
      from: WALLET,
      to: OTHER,
      amount: [{ denom: 'uluna', amount: '5000000' }],
    });
    stubFetch([makeLcdResponse([txResp]), makeLcdResponse([])]);

    const txs = await adapter.getTransactions(WALLET, start, end, 'terra');

    expect(txs).toHaveLength(1);
    expect(txs[0].type).toBe('send');
    expect(txs[0].assetSymbol).toBe('LUNA');
    expect(txs[0].amount).toBe('5');
    expect(txs[0].txHash).toBe('AAAA1111');
    expect(txs[0].fromAddress).toBe(WALLET);
    expect(txs[0].toAddress).toBe(OTHER);
    expect(txs[0].sourceApi).toBe('terra_fcd');
  });

  it('parses a LUNA receive', async () => {
    const txResp = makeTxResponse({
      txhash: 'BBBB2222',
      timestamp: JAN15,
      from: OTHER,
      to: WALLET,
      amount: [{ denom: 'uluna', amount: '2000000' }],
    });
    stubFetch([makeLcdResponse([]), makeLcdResponse([txResp])]);

    const txs = await adapter.getTransactions(WALLET, start, end, 'terra');

    expect(txs).toHaveLength(1);
    expect(txs[0].type).toBe('receive');
    expect(txs[0].assetSymbol).toBe('LUNA');
    expect(txs[0].amount).toBe('2');
    expect(txs[0].fromAddress).toBe(OTHER);
    expect(txs[0].toAddress).toBe(WALLET);
  });

  it('converts uluna to LUNA with fractional part', async () => {
    const txResp = makeTxResponse({
      txhash: 'CONV1',
      timestamp: JAN15,
      from: OTHER,
      to: WALLET,
      amount: [{ denom: 'uluna', amount: '1500000' }],
    });
    stubFetch([makeLcdResponse([]), makeLcdResponse([txResp])]);

    const txs = await adapter.getTransactions(WALLET, start, end, 'terra');
    expect(txs[0].amount).toBe('1.5');
  });

  it('skips transactions outside the date window', async () => {
    const txFeb = makeTxResponse({ txhash: 'FEB', timestamp: FEB24, from: OTHER, to: WALLET, amount: [{ denom: 'uluna', amount: '1000000' }] });
    const txDec = makeTxResponse({ txhash: 'DEC', timestamp: DEC23, from: OTHER, to: WALLET, amount: [{ denom: 'uluna', amount: '1000000' }] });
    stubFetch([makeLcdResponse([]), makeLcdResponse([txFeb, txDec])]);

    const txs = await adapter.getTransactions(WALLET, start, end, 'terra');
    expect(txs).toHaveLength(0);
  });

  it('stops paginating when a tx is before startDate', async () => {
    const txIn  = makeTxResponse({ txhash: 'IN',  timestamp: JAN15, from: OTHER, to: WALLET, amount: [{ denom: 'uluna', amount: '1000000' }] });
    const txOut = makeTxResponse({ txhash: 'OUT', timestamp: DEC23, from: OTHER, to: WALLET, amount: [{ denom: 'uluna', amount: '1000000' }] });
    stubFetch([makeLcdResponse([]), makeLcdResponse([txIn, txOut], 2)]);

    const txs = await adapter.getTransactions(WALLET, start, end, 'terra');
    expect(txs).toHaveLength(1);
    expect(txs[0].txHash).toBe('IN');
  });

  it('skips failed transactions (code !== 0)', async () => {
    const txFail = makeTxResponse({
      txhash: 'FAIL',
      timestamp: JAN15,
      from: OTHER,
      to: WALLET,
      amount: [{ denom: 'uluna', amount: '1000000' }],
      code: 4,
    });
    stubFetch([makeLcdResponse([]), makeLcdResponse([txFail])]);

    const txs = await adapter.getTransactions(WALLET, start, end, 'terra');
    expect(txs).toHaveLength(0);
  });

  it('skips messages that are not MsgSend', async () => {
    const txNonSend = {
      txhash: 'NS1',
      timestamp: JAN15,
      tx: {
        body: {
          messages: [
            { '@type': '/terra.wasm.v1beta1.MsgExecuteContract', contract: 'terra1abc', msg: {} },
          ],
        },
      },
    };
    stubFetch([makeLcdResponse([]), makeLcdResponse([txNonSend])]);

    const txs = await adapter.getTransactions(WALLET, start, end, 'terra');
    expect(txs).toHaveLength(0);
  });

  it('handles non-LUNA u-prefixed denoms', async () => {
    const txResp = makeTxResponse({
      txhash: 'DENOM1',
      timestamp: JAN15,
      from: OTHER,
      to: WALLET,
      amount: [{ denom: 'uusd', amount: '10000000' }],
    });
    stubFetch([makeLcdResponse([]), makeLcdResponse([txResp])]);

    const txs = await adapter.getTransactions(WALLET, start, end, 'terra');
    expect(txs[0].assetSymbol).toBe('USD');
    expect(txs[0].amount).toBe('10000000'); // no conversion for non-uluna
  });

  it('handles IBC token denoms', async () => {
    const txResp = makeTxResponse({
      txhash: 'IBC1',
      timestamp: JAN15,
      from: OTHER,
      to: WALLET,
      amount: [{ denom: 'ibc/27394FB092D2ECCD56123C74F36E4C1F926001CEADA9CA97EA622B25F41E5EB2', amount: '500000' }],
    });
    stubFetch([makeLcdResponse([]), makeLcdResponse([txResp])]);

    const txs = await adapter.getTransactions(WALLET, start, end, 'terra');
    expect(txs[0].assetSymbol).toMatch(/^IBC\//);
  });

  it('deduplicates the same tx+symbol+type appearing in both queries', async () => {
    // A self-send: the same tx appears in both queries, but with different types → both kept
    const txSelf = makeTxResponse({
      txhash: 'SELF',
      timestamp: JAN15,
      from: WALLET,
      to: WALLET,
      amount: [{ denom: 'uluna', amount: '1000000' }],
    });
    stubFetch([makeLcdResponse([txSelf]), makeLcdResponse([txSelf])]);

    const txs = await adapter.getTransactions(WALLET, start, end, 'terra');
    // send and receive are distinct types → 2 entries, no exact duplicates
    const keys = txs.map(t => `${t.txHash}-${t.type}`);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('paginates when total exceeds first page', async () => {
    const page1 = Array.from({ length: 100 }, (_, i) =>
      makeTxResponse({ txhash: `P1TX${i}`, timestamp: JAN15, from: OTHER, to: WALLET, amount: [{ denom: 'uluna', amount: '1000000' }] })
    );
    const page2 = [
      makeTxResponse({ txhash: 'P2TX0', timestamp: JAN15, from: OTHER, to: WALLET, amount: [{ denom: 'uluna', amount: '2000000' }] }),
    ];

    vi.useFakeTimers();
    stubFetch([
      makeLcdResponse([]),                                  // sent query — empty
      { tx_responses: page1, pagination: { next_key: null, total: '101' } },
      { tx_responses: page2, pagination: { next_key: null, total: '101' } },
    ]);

    const promise = adapter.getTransactions(WALLET, start, end, 'terra');
    await vi.runAllTimersAsync();
    const txs = await promise;
    vi.useRealTimers();

    expect(txs).toHaveLength(101);
  });
});

describe('TerraAdapter metadata', () => {
  const adapter = new TerraAdapter();

  it('declares terra as supported chain', () => {
    expect(adapter.supportedChains).toContain('terra');
  });

  it('name references LCD or Terra', () => {
    expect(adapter.name).toMatch(/terra|lcd/i);
  });
});
