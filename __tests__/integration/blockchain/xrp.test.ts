import { describe, it, expect, vi, afterEach } from 'vitest';
import { XrpAdapter } from '@/lib/blockchain/xrp';

// Ripple epoch: 2000-01-01 00:00:00 UTC = Unix 946684800
const RIPPLE_EPOCH = 946684800;

function toRippleTime(iso: string): number {
  return Math.floor(new Date(iso).getTime() / 1000) - RIPPLE_EPOCH;
}

const JAN15 = toRippleTime('2024-01-15T12:00:00Z');
const JAN31 = toRippleTime('2024-01-31T12:00:00Z');
// Use a date 6+ months before start — far enough that no UTC offset shifts it into the window
const JUN2023 = toRippleTime('2023-06-01T12:00:00Z');

const WALLET = 'rHb9CJAWyB4rj91VRWn96DkukG4bwdtyTh';
const OTHER = 'rPT1Sjq2YGrBMTttX4GZHjKu9dyfzbpAYe';

function makePayment({
  hash,
  date,
  account,
  destination = OTHER,
  amount,
  result = 'tesSUCCESS',
}: {
  hash: string;
  date: number;
  account: string;
  destination?: string;
  amount: string | object;
  result?: string;
}) {
  return {
    validated: true,
    meta: { TransactionResult: result, delivered_amount: amount },
    tx: { TransactionType: 'Payment', Account: account, Destination: destination, Amount: amount, date, hash },
  };
}

function xrplResponse(transactions: object[], marker?: string) {
  return {
    result: {
      status: 'success',
      account: WALLET,
      transactions,
      ...(marker ? { marker } : {}),
    },
  };
}

function stubSinglePage(transactions: object[]) {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve(xrplResponse(transactions)),
    })
  );
}

afterEach(() => vi.unstubAllGlobals());

describe('XrpAdapter.getTransactions', () => {
  const adapter = new XrpAdapter();
  const start = new Date('2024-01-01T00:00:00Z');
  const end = new Date('2024-01-31T23:59:59Z');

  it('returns empty array when the API has no transactions', async () => {
    stubSinglePage([]);
    const txs = await adapter.getTransactions(WALLET, start, end, 'xrp');
    expect(txs).toHaveLength(0);
  });

  it('parses native XRP drops correctly (1 XRP = 1_000_000 drops)', async () => {
    stubSinglePage([makePayment({ hash: 'H1', date: JAN15, account: OTHER, destination: WALLET, amount: '2500000' })]);

    const txs = await adapter.getTransactions(WALLET, start, end, 'xrp');

    expect(txs).toHaveLength(1);
    expect(txs[0].assetSymbol).toBe('XRP');
    expect(txs[0].amount).toBe('2.500000');
    expect(txs[0].txHash).toBe('H1');
    expect(txs[0].sourceApi).toBe('xrpl');
  });

  it('detects receive when the wallet is the Destination', async () => {
    stubSinglePage([makePayment({ hash: 'R1', date: JAN15, account: OTHER, destination: WALLET, amount: '1000000' })]);

    const txs = await adapter.getTransactions(WALLET, start, end, 'xrp');
    expect(txs[0].type).toBe('receive');
  });

  it('detects send when the wallet is the Account (sender)', async () => {
    stubSinglePage([makePayment({ hash: 'S1', date: JAN15, account: WALLET, destination: OTHER, amount: '1000000' })]);

    const txs = await adapter.getTransactions(WALLET, start, end, 'xrp');
    expect(txs[0].type).toBe('send');
  });

  it('parses IOU issued currency amounts', async () => {
    const iouAmount = { currency: 'USD', issuer: 'rhub8VRN55s94qWKDv6jmDy1pUykJzF3wq', value: '100.50' };
    stubSinglePage([makePayment({ hash: 'IOU1', date: JAN15, account: OTHER, destination: WALLET, amount: iouAmount })]);

    const txs = await adapter.getTransactions(WALLET, start, end, 'xrp');
    expect(txs[0].assetSymbol).toBe('USD');
    expect(txs[0].amount).toBe('100.50');
  });

  it('stops early when transaction date is before startDate', async () => {
    // JUN2023 is 6+ months before the Jan 2024 start — unambiguously before any timezone shift
    stubSinglePage([makePayment({ hash: 'OLD', date: JUN2023, account: OTHER, destination: WALLET, amount: '1000000' })]);

    const txs = await adapter.getTransactions(WALLET, start, end, 'xrp');
    expect(txs).toHaveLength(0);
  });

  it('skips transactions with non-successful TransactionResult', async () => {
    stubSinglePage([
      makePayment({ hash: 'FAIL', date: JAN15, account: OTHER, destination: WALLET, amount: '1000000', result: 'tecPATH_DRY' }),
    ]);

    const txs = await adapter.getTransactions(WALLET, start, end, 'xrp');
    expect(txs).toHaveLength(0);
  });

  it('skips non-Payment transaction types', async () => {
    const offerCreate = {
      validated: true,
      meta: { TransactionResult: 'tesSUCCESS' },
      tx: { TransactionType: 'OfferCreate', Account: OTHER, date: JAN15, hash: 'OFFER1', Amount: '1000000' },
    };
    stubSinglePage([offerCreate]);

    const txs = await adapter.getTransactions(WALLET, start, end, 'xrp');
    expect(txs).toHaveLength(0);
  });

  it('skips unvalidated transactions', async () => {
    const unvalidated = {
      validated: false,
      meta: { TransactionResult: 'tesSUCCESS', delivered_amount: '1000000' },
      tx: { TransactionType: 'Payment', Account: OTHER, Destination: WALLET, date: JAN15, hash: 'UV1', Amount: '1000000' },
    };
    stubSinglePage([unvalidated]);

    const txs = await adapter.getTransactions(WALLET, start, end, 'xrp');
    expect(txs).toHaveLength(0);
  });

  it('skips transactions without a date field', async () => {
    const noDate = {
      validated: true,
      meta: { TransactionResult: 'tesSUCCESS', delivered_amount: '1000000' },
      tx: { TransactionType: 'Payment', Account: OTHER, Destination: WALLET, hash: 'ND1', Amount: '1000000' },
      // no date field
    };
    stubSinglePage([noDate]);

    const txs = await adapter.getTransactions(WALLET, start, end, 'xrp');
    expect(txs).toHaveLength(0);
  });

  it('filters out transactions after endDate', async () => {
    // JAN31 is within range, but if we had a FEB date it should be skipped
    const feb = toRippleTime('2024-02-10T12:00:00Z');
    stubSinglePage([
      makePayment({ hash: 'FEB', date: feb, account: OTHER, destination: WALLET, amount: '1000000' }),
      makePayment({ hash: 'JAN', date: JAN15, account: OTHER, destination: WALLET, amount: '500000' }),
    ]);

    const txs = await adapter.getTransactions(WALLET, start, end, 'xrp');
    expect(txs).toHaveLength(1);
    expect(txs[0].txHash).toBe('JAN');
  });

  it('paginates using the marker until no marker is returned', async () => {
    const page1 = makePayment({ hash: 'P1', date: JAN31, account: OTHER, destination: WALLET, amount: '1000000' });
    const page2 = makePayment({ hash: 'P2', date: JAN15, account: OTHER, destination: WALLET, amount: '1000000' });

    const fetchMock = vi.fn()
      .mockResolvedValueOnce({
        ok: true, status: 200,
        json: () => Promise.resolve(xrplResponse([page1], 'marker-token-abc')),
      })
      .mockResolvedValueOnce({
        ok: true, status: 200,
        json: () => Promise.resolve(xrplResponse([page2])), // no marker = last page
      });

    vi.stubGlobal('fetch', fetchMock);

    const txs = await adapter.getTransactions(WALLET, start, end, 'xrp');

    expect(txs).toHaveLength(2);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    // Second call should carry the marker in the request body
    const secondBody = JSON.parse(fetchMock.mock.calls[1][1].body);
    expect(secondBody.params[0].marker).toBe('marker-token-abc');
  });

  it('reports correct fromAddress and toAddress', async () => {
    stubSinglePage([makePayment({ hash: 'ADDR1', date: JAN15, account: OTHER, destination: WALLET, amount: '1000000' })]);

    const txs = await adapter.getTransactions(WALLET, start, end, 'xrp');
    expect(txs[0].fromAddress).toBe(OTHER);
    expect(txs[0].toAddress).toBe(WALLET);
  });
});

describe('XrpAdapter metadata', () => {
  const adapter = new XrpAdapter();

  it('declares xrp as supported chain', () => {
    expect(adapter.supportedChains).toContain('xrp');
  });

  it('has a descriptive name', () => {
    expect(adapter.name).toBeTruthy();
    expect(typeof adapter.name).toBe('string');
  });
});
