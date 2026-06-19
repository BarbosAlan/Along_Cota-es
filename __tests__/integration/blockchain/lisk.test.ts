import { describe, it, expect, vi, afterEach } from 'vitest';
import { LiskAdapter } from '@/lib/blockchain/lisk';
import { BlockchainApiError } from '@/lib/errors';

const WALLET   = '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045';
const OTHER    = '0x742d35Cc6634C0532925a3b8D4C9bde7345e5432';
const CONTRACT = '0xabcdef1234567890abcdef1234567890abcdef12';

const JAN15_TS = String(Math.floor(new Date('2024-01-15T12:00:00Z').getTime() / 1000));
const FEB10_TS = String(Math.floor(new Date('2024-02-10T12:00:00Z').getTime() / 1000));
const DEC23_TS = String(Math.floor(new Date('2023-12-01T12:00:00Z').getTime() / 1000));

type NativeTx = { hash: string; timeStamp: string; from: string; to: string; value: string; isError: string };
type TokenTx  = { hash: string; timeStamp: string; from: string; to: string; value: string; tokenSymbol: string; tokenDecimal: string; contractAddress: string };

function okResponse<T>(result: T[]) {
  return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ status: '1', message: 'OK', result }) });
}
function noTxsResponse() {
  return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ status: '0', message: 'No transactions found', result: [] }) });
}
function blockResponse(blockNumber = '100000') {
  return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ status: '1', result: blockNumber }) });
}

// Stubs fetch by URL pattern — avoids call-order fragility from Promise.all in block lookups
function stubFetch(nativeTxs: NativeTx[], tokenTxs: TokenTx[]) {
  vi.stubGlobal('fetch', vi.fn().mockImplementation((url: string) => {
    if (url.includes('getblocknobytime')) return blockResponse();
    if (url.includes('action=txlist'))   return nativeTxs.length ? okResponse(nativeTxs) : noTxsResponse();
    if (url.includes('action=tokentx'))  return tokenTxs.length  ? okResponse(tokenTxs)  : noTxsResponse();
    return Promise.resolve({ ok: false, status: 500, json: () => Promise.resolve({}) });
  }));
}

function nativeTx(overrides: Partial<NativeTx> = {}): NativeTx {
  return {
    hash: 'H1', timeStamp: JAN15_TS,
    from: OTHER.toLowerCase(), to: WALLET.toLowerCase(),
    value: '1000000000000000000', isError: '0',
    ...overrides,
  };
}

function tokenTx(overrides: Partial<TokenTx> = {}): TokenTx {
  return {
    hash: 'T1', timeStamp: JAN15_TS,
    from: OTHER.toLowerCase(), to: WALLET.toLowerCase(),
    value: '500000000000000000', tokenSymbol: 'USDT', tokenDecimal: '18',
    contractAddress: CONTRACT,
    ...overrides,
  };
}

afterEach(() => vi.unstubAllGlobals());

// --- Rejeição de endereços L1 ---

describe('LiskAdapter — endereço lsk... (L1 descomissionado)', () => {
  const adapter = new LiskAdapter();
  const start = new Date('2024-01-01T00:00:00Z');
  const end   = new Date('2024-01-31T23:59:59Z');

  it('lança BlockchainApiError para endereço lsk...', async () => {
    await expect(
      adapter.getTransactions('lskdxc4ta5j43jp9ro3f8zqbxta9fn6jwzjucw64y', start, end, 'lisk')
    ).rejects.toBeInstanceOf(BlockchainApiError);
  });

  it('erro não é retryable', async () => {
    await expect(
      adapter.getTransactions('lskdxc4ta5j43jp9ro3f8zqbxta9fn6jwzjucw64y', start, end, 'lisk')
    ).rejects.toMatchObject({ retryable: false });
  });

  it('mensagem menciona migração L2', async () => {
    await expect(
      adapter.getTransactions('lskdxc4ta5j43jp9ro3f8zqbxta9fn6jwzjucw64y', start, end, 'lisk')
    ).rejects.toMatchObject({ message: expect.stringMatching(/L2|migra|desativad/i) });
  });

  it('não faz requisição de rede para endereço lsk...', async () => {
    const fetchSpy = vi.spyOn(global, 'fetch');
    await adapter.getTransactions('lskdxc4ta5j43jp9ro3f8zqbxta9fn6jwzjucw64y', start, end, 'lisk').catch(() => {});
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

// --- Comportamento real com endereços 0x ---

describe('LiskAdapter.getTransactions (Blockscout)', () => {
  const adapter = new LiskAdapter();
  const start = new Date('2024-01-01T00:00:00Z');
  const end   = new Date('2024-01-31T23:59:59Z');

  it('retorna array vazio quando não há transações', async () => {
    stubFetch([], []);
    const txs = await adapter.getTransactions(WALLET, start, end, 'lisk');
    expect(txs).toHaveLength(0);
  });

  it('parseia LSK nativo corretamente (18 decimais)', async () => {
    stubFetch([nativeTx({ value: '2000000000000000000' })], []);

    const txs = await adapter.getTransactions(WALLET, start, end, 'lisk');

    expect(txs).toHaveLength(1);
    expect(txs[0].assetSymbol).toBe('LSK');
    expect(txs[0].amount).toBe('2');
    expect(txs[0].sourceApi).toBe('lisk_api');
  });

  it('detecta receive quando wallet é o destinatário', async () => {
    stubFetch([nativeTx({ from: OTHER.toLowerCase(), to: WALLET.toLowerCase() })], []);

    const txs = await adapter.getTransactions(WALLET, start, end, 'lisk');
    expect(txs[0].type).toBe('receive');
  });

  it('detecta send quando wallet é o remetente', async () => {
    stubFetch([nativeTx({ from: WALLET.toLowerCase(), to: OTHER.toLowerCase() })], []);

    const txs = await adapter.getTransactions(WALLET, start, end, 'lisk');
    expect(txs[0].type).toBe('send');
  });

  it('define fromAddress e toAddress corretamente', async () => {
    stubFetch([nativeTx({ from: OTHER.toLowerCase(), to: WALLET.toLowerCase() })], []);

    const txs = await adapter.getTransactions(WALLET, start, end, 'lisk');
    expect(txs[0].fromAddress).toBe(OTHER.toLowerCase());
    expect(txs[0].toAddress).toBe(WALLET.toLowerCase());
  });

  it('filtra transações com isError=1', async () => {
    stubFetch([nativeTx({ isError: '1' })], []);

    const txs = await adapter.getTransactions(WALLET, start, end, 'lisk');
    expect(txs).toHaveLength(0);
  });

  it('filtra transações nativas com value=0 (chamadas de contrato)', async () => {
    stubFetch([nativeTx({ value: '0' })], []);

    const txs = await adapter.getTransactions(WALLET, start, end, 'lisk');
    expect(txs).toHaveLength(0);
  });

  it('filtra transações antes de startDate', async () => {
    stubFetch([nativeTx({ timeStamp: DEC23_TS })], []);

    const txs = await adapter.getTransactions(WALLET, start, end, 'lisk');
    expect(txs).toHaveLength(0);
  });

  it('filtra transações após endDate', async () => {
    stubFetch([nativeTx({ timeStamp: FEB10_TS })], []);

    const txs = await adapter.getTransactions(WALLET, start, end, 'lisk');
    expect(txs).toHaveLength(0);
  });

  it('parseia tokens ERC-20 com decimais corretos', async () => {
    stubFetch([], [tokenTx({ value: '1500000', tokenSymbol: 'USDC', tokenDecimal: '6' })]);

    const txs = await adapter.getTransactions(WALLET, start, end, 'lisk');

    expect(txs).toHaveLength(1);
    expect(txs[0].assetSymbol).toBe('USDC');
    expect(txs[0].amount).toBe('1.5');
    expect(txs[0].assetAddress).toBe(CONTRACT);
    expect(txs[0].sourceApi).toBe('lisk_api');
  });

  it('filtra tokens ERC-20 com value=0 (approve)', async () => {
    stubFetch([], [tokenTx({ value: '0' })]);

    const txs = await adapter.getTransactions(WALLET, start, end, 'lisk');
    expect(txs).toHaveLength(0);
  });

  it('retorna tanto nativas quanto tokens na mesma chamada', async () => {
    stubFetch([nativeTx({ hash: 'N1' })], [tokenTx({ hash: 'T1' })]);

    const txs = await adapter.getTransactions(WALLET, start, end, 'lisk');
    expect(txs).toHaveLength(2);
    const hashes = txs.map(t => t.txHash);
    expect(hashes).toContain('N1');
    expect(hashes).toContain('T1');
  });

  it('pagina txlist até a última página (< PAGE_SIZE itens)', async () => {
    const page1 = Array.from({ length: 100 }, (_, i) => nativeTx({ hash: `P1-${i}` }));
    const page2 = [nativeTx({ hash: 'P2-0' })];

    let txlistCallCount = 0;
    vi.stubGlobal('fetch', vi.fn().mockImplementation((url: string) => {
      if (url.includes('getblocknobytime')) return blockResponse();
      if (url.includes('action=tokentx'))  return noTxsResponse();
      if (url.includes('action=txlist')) {
        txlistCallCount++;
        return txlistCallCount === 1 ? okResponse(page1) : okResponse(page2);
      }
      return Promise.resolve({ ok: false, status: 500, json: () => Promise.resolve({}) });
    }));

    const txs = await adapter.getTransactions(WALLET, start, end, 'lisk');
    expect(txs).toHaveLength(101);
    expect(txlistCallCount).toBe(2);
  });
});

// --- Metadados ---

describe('LiskAdapter metadata', () => {
  const adapter = new LiskAdapter();

  it('declara lisk como chain suportada', () => {
    expect(adapter.supportedChains).toContain('lisk');
  });

  it('tem nome descritivo', () => {
    expect(adapter.name).toBe('Lisk Blockscout');
  });
});
