import { describe, it, expect, vi, afterEach } from 'vitest';
import { KoiosAdapter } from '@/lib/blockchain/koios';

const WALLET = 'addr1qx52knm8mh7g7q8u5d8z9y6jvvnrk5j4w8j3k8m5s4v6l4p9q2h8j';
const OTHER  = 'addr1qy93j4m9q7k3z8n7r2m4s5v9l6j8t4k5j6m8n9r2q4s5v6l7p8j9';

const LOVELACE = 1_000_000n;
const JAN15_TS  = Math.floor(new Date('2024-01-15T12:00:00Z').getTime() / 1000);
const DEC23_TS  = Math.floor(new Date('2023-12-01T12:00:00Z').getTime() / 1000);

function makeAddrTxs(items: { tx_hash: string; block_time: number }[]) {
  return items;
}

function makeTxInfo({
  tx_hash,
  block_time,
  inputs,
  outputs,
}: {
  tx_hash: string;
  block_time: number;
  inputs: { bech32: string }[];
  outputs: { bech32: string; value: string }[];
}) {
  return {
    tx_hash,
    block_time,
    inputs: inputs.map(i => ({ payment_addr: { bech32: i.bech32 } })),
    outputs: outputs.map(o => ({ payment_addr: { bech32: o.bech32 }, value: o.value })),
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

// Koios works in two phases: getAddrTxs (GET) then getTxInfo (POST).
// For a simple test with N txs: call 1 = addrTxs, call 2 = txInfo batch.
function stubKoios(addrTxs: object[], txInfos: object[]) {
  return stubFetch([addrTxs, txInfos]);
}

describe('KoiosAdapter.getTransactions', () => {
  const adapter = new KoiosAdapter();
  const start = new Date('2024-01-01T00:00:00Z');
  const end   = new Date('2024-01-31T23:59:59Z');

  afterEach(() => vi.unstubAllGlobals());

  it('returns empty array when no transactions', async () => {
    stubFetch([[]]); // getAddrTxs returns empty → getTxInfo never called
    const txs = await adapter.getTransactions(WALLET, start, end, 'cardano');
    expect(txs).toHaveLength(0);
  });

  it('parses an ADA receive', async () => {
    const addrTxs = makeAddrTxs([{ tx_hash: 'cardtx1', block_time: JAN15_TS }]);
    const txInfos = [makeTxInfo({
      tx_hash: 'cardtx1',
      block_time: JAN15_TS,
      inputs:  [{ bech32: OTHER }],
      outputs: [{ bech32: WALLET, value: '2000000' }],
    })];
    stubKoios(addrTxs, txInfos);

    const txs = await adapter.getTransactions(WALLET, start, end, 'cardano');

    expect(txs).toHaveLength(1);
    expect(txs[0].type).toBe('receive');
    expect(txs[0].assetSymbol).toBe('ADA');
    expect(txs[0].amount).toBe('2.000000');
    expect(txs[0].txHash).toBe('cardtx1');
    expect(txs[0].fromAddress).toBe(OTHER);
    expect(txs[0].sourceApi).toBe('koios');
  });

  it('parses an ADA send — change output excluded from amount', async () => {
    const addrTxs = makeAddrTxs([{ tx_hash: 'cardtx2', block_time: JAN15_TS }]);
    const txInfos = [makeTxInfo({
      tx_hash: 'cardtx2',
      block_time: JAN15_TS,
      inputs:  [{ bech32: WALLET }],
      outputs: [
        { bech32: OTHER,   value: '1500000' }, // sent
        { bech32: WALLET,  value: '400000' },  // change
      ],
    })];
    stubKoios(addrTxs, txInfos);

    const txs = await adapter.getTransactions(WALLET, start, end, 'cardano');

    expect(txs).toHaveLength(1);
    expect(txs[0].type).toBe('send');
    expect(txs[0].amount).toBe('1.500000');
    expect(txs[0].toAddress).toBe(OTHER);
  });

  it('skips transactions where wallet-relevant lovelace is zero', async () => {
    // Wallet is in inputs but all outputs also go back to wallet → isSend=true, amount=0
    const addrTxs = makeAddrTxs([{ tx_hash: 'zerotx', block_time: JAN15_TS }]);
    const txInfos = [makeTxInfo({
      tx_hash: 'zerotx',
      block_time: JAN15_TS,
      inputs:  [{ bech32: WALLET }],
      outputs: [{ bech32: WALLET, value: '1000000' }], // all change
    })];
    stubKoios(addrTxs, txInfos);

    const txs = await adapter.getTransactions(WALLET, start, end, 'cardano');
    expect(txs).toHaveLength(0);
  });

  it('stops collecting addrTxs when a tx is before startDate', async () => {
    // Koios returns txs in descending order — old tx stops the loop
    const addrTxs = makeAddrTxs([
      { tx_hash: 'newTx', block_time: JAN15_TS },
      { tx_hash: 'oldTx', block_time: DEC23_TS }, // before start → stop loop
    ]);
    // Only newTx should be fetched in tx_info
    const txInfos = [makeTxInfo({
      tx_hash: 'newTx',
      block_time: JAN15_TS,
      inputs:  [{ bech32: OTHER }],
      outputs: [{ bech32: WALLET, value: '1000000' }],
    })];
    stubKoios(addrTxs, txInfos);

    const txs = await adapter.getTransactions(WALLET, start, end, 'cardano');
    expect(txs).toHaveLength(1);
    expect(txs[0].txHash).toBe('newTx');
  });

  it('uses BigInt to handle large lovelace values without precision loss', async () => {
    const largeValue = '45000000000000'; // 45M ADA
    const addrTxs = makeAddrTxs([{ tx_hash: 'bigtx', block_time: JAN15_TS }]);
    const txInfos = [makeTxInfo({
      tx_hash: 'bigtx',
      block_time: JAN15_TS,
      inputs:  [{ bech32: OTHER }],
      outputs: [{ bech32: WALLET, value: largeValue }],
    })];
    stubKoios(addrTxs, txInfos);

    const txs = await adapter.getTransactions(WALLET, start, end, 'cardano');

    const big = BigInt(largeValue);
    const expected = `${big / LOVELACE}.${(big % LOVELACE).toString().padStart(6, '0')}`;
    expect(txs[0].amount).toBe(expected);
  });
});

describe('KoiosAdapter metadata', () => {
  const adapter = new KoiosAdapter();

  it('declares cardano as supported chain', () => {
    expect(adapter.supportedChains).toContain('cardano');
  });

  it('has a descriptive name', () => {
    expect(typeof adapter.name).toBe('string');
    expect(adapter.name.length).toBeGreaterThan(0);
  });
});
