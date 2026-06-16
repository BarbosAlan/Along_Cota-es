import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { TronGridAdapter } from '@/lib/blockchain/trongrid';

// Base58-style addresses starting with T — hexToBase58 returns them unchanged
// because 'T' is not a valid hex character
const TRON_WALLET = 'TSenderWalletAddress1234ABCD';
const TRON_OTHER  = 'TReceiverOtherAddress5678XYZ';

const SUN = 1_000_000;
const JAN15_MS  = new Date('2024-01-15T12:00:00Z').getTime(); // milliseconds
const DEC23_MS  = new Date('2023-12-01T12:00:00Z').getTime();
const FEB24_MS  = new Date('2024-02-10T12:00:00Z').getTime();

function makeTrxTx({
  txID,
  blockTs,
  ownerAddr,
  toAddr,
  amount,
  contractRet = 'SUCCESS',
  contractType = 'TransferContract',
}: {
  txID: string;
  blockTs: number;
  ownerAddr: string;
  toAddr: string;
  amount: number;
  contractRet?: string;
  contractType?: string;
}) {
  return {
    txID,
    block_timestamp: blockTs,
    raw_data: {
      contract: [{
        type: contractType,
        parameter: { value: { amount, owner_address: ownerAddr, to_address: toAddr } },
      }],
    },
    ret: [{ contractRet }],
  };
}

function makeTrc20Tx({
  txId,
  blockTs,
  from,
  to,
  value,
  symbol = 'USDT',
  decimals = 6,
}: {
  txId: string;
  blockTs: number;
  from: string;
  to: string;
  value: string;
  symbol?: string;
  decimals?: number;
}) {
  return {
    transaction_id: txId,
    block_timestamp: blockTs,
    from,
    to,
    value,
    token_info: { symbol, address: '0xtokencontract', decimals },
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

// TronGrid fetches two endpoints in sequence: TRX then TRC-20.
// Each needs its own response: { data: [...], meta: {} }
function stubTron(trxTxs: object[], trc20Txs: object[] = []) {
  return stubFetch([
    { data: trxTxs,  meta: {} },
    { data: trc20Txs, meta: {} },
  ]);
}

describe('TronGridAdapter.getTransactions', () => {
  const adapter = new TronGridAdapter();
  const start = new Date('2024-01-01T00:00:00Z');
  const end   = new Date('2024-01-31T23:59:59Z');

  beforeEach(() => vi.useFakeTimers());
  afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

  async function run(wallet = TRON_WALLET) {
    const promise = adapter.getTransactions(wallet, start, end, 'tron');
    await vi.runAllTimersAsync();
    return await promise;
  }

  it('returns empty array when no transactions', async () => {
    stubTron([]);
    expect(await run()).toHaveLength(0);
  });

  it('parses a TRX receive', async () => {
    const tx = makeTrxTx({
      txID: 'trxtx1',
      blockTs: JAN15_MS,
      ownerAddr: TRON_OTHER,
      toAddr: TRON_WALLET,
      amount: 2 * SUN,
    });
    stubTron([tx]);

    const txs = await run();

    expect(txs).toHaveLength(1);
    expect(txs[0].type).toBe('receive');
    expect(txs[0].assetSymbol).toBe('TRX');
    expect(txs[0].amount).toBe('2.000000');
    expect(txs[0].txHash).toBe('trxtx1');
    expect(txs[0].sourceApi).toBe('trongrid');
  });

  it('parses a TRX send', async () => {
    const tx = makeTrxTx({
      txID: 'trxtx2',
      blockTs: JAN15_MS,
      ownerAddr: TRON_WALLET,
      toAddr: TRON_OTHER,
      amount: SUN,
    });
    stubTron([tx]);

    const txs = await run();

    expect(txs).toHaveLength(1);
    expect(txs[0].type).toBe('send');
    expect(txs[0].amount).toBe('1.000000');
  });

  it('skips TRX transactions with non-SUCCESS contractRet', async () => {
    const tx = makeTrxTx({
      txID: 'failTx',
      blockTs: JAN15_MS,
      ownerAddr: TRON_OTHER,
      toAddr: TRON_WALLET,
      amount: SUN,
      contractRet: 'OUT_OF_ENERGY',
    });
    stubTron([tx]);
    expect(await run()).toHaveLength(0);
  });

  it('skips non-TransferContract transaction types', async () => {
    const tx = makeTrxTx({
      txID: 'nonTransfer',
      blockTs: JAN15_MS,
      ownerAddr: TRON_OTHER,
      toAddr: TRON_WALLET,
      amount: SUN,
      contractType: 'TriggerSmartContract',
    });
    stubTron([tx]);
    expect(await run()).toHaveLength(0);
  });

  it('skips TRX transactions before startDate', async () => {
    const tx = makeTrxTx({
      txID: 'oldTx',
      blockTs: DEC23_MS,
      ownerAddr: TRON_OTHER,
      toAddr: TRON_WALLET,
      amount: SUN,
    });
    stubTron([tx]);
    expect(await run()).toHaveLength(0);
  });

  it('skips TRX transactions after endDate', async () => {
    const tx = makeTrxTx({
      txID: 'futureTx',
      blockTs: FEB24_MS,
      ownerAddr: TRON_OTHER,
      toAddr: TRON_WALLET,
      amount: SUN,
    });
    stubTron([tx]);
    expect(await run()).toHaveLength(0);
  });

  it('parses a TRC-20 token receive with correct decimal conversion', async () => {
    const tx = makeTrc20Tx({
      txId: 'trctx1',
      blockTs: JAN15_MS,
      from: TRON_OTHER,
      to: TRON_WALLET,
      value: '1500000',  // 1.5 USDT with 6 decimals
      symbol: 'USDT',
      decimals: 6,
    });
    stubTron([], [tx]);

    const txs = await run();

    expect(txs).toHaveLength(1);
    expect(txs[0].assetSymbol).toBe('USDT');
    expect(txs[0].amount).toBe('1.500000');
    expect(txs[0].type).toBe('receive');
    expect(txs[0].txHash).toBe('trctx1');
  });

  it('parses a TRC-20 token send', async () => {
    const tx = makeTrc20Tx({
      txId: 'trctx2',
      blockTs: JAN15_MS,
      from: TRON_WALLET,
      to: TRON_OTHER,
      value: '2000000',
    });
    stubTron([], [tx]);

    const txs = await run();

    expect(txs[0].type).toBe('send');
  });

  it('paginates TRX when fingerprint is returned', async () => {
    const page1Tx = makeTrxTx({
      txID: 'p1trx',
      blockTs: JAN15_MS,
      ownerAddr: TRON_OTHER,
      toAddr: TRON_WALLET,
      amount: SUN,
    });
    const page2Tx = makeTrxTx({
      txID: 'p2trx',
      blockTs: JAN15_MS,
      ownerAddr: TRON_OTHER,
      toAddr: TRON_WALLET,
      amount: 2 * SUN,
    });
    stubFetch([
      { data: [page1Tx], meta: { fingerprint: 'page2token' } }, // TRX page 1
      { data: [page2Tx], meta: {} },                           // TRX page 2
      { data: [], meta: {} },                                  // TRC-20
    ]);

    const txs = await run();

    // Both TRX pages should be collected
    const trxTxs = txs.filter(t => t.assetSymbol === 'TRX');
    expect(trxTxs).toHaveLength(2);
  });
});

describe('TronGridAdapter metadata', () => {
  const adapter = new TronGridAdapter();

  it('declares tron as supported chain', () => {
    expect(adapter.supportedChains).toContain('tron');
  });

  it('has a descriptive name', () => {
    expect(typeof adapter.name).toBe('string');
    expect(adapter.name.length).toBeGreaterThan(0);
  });
});
