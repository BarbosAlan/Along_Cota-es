import { describe, it, expect, vi } from 'vitest';
import { LiskAdapter } from '@/lib/blockchain/lisk';
import { BlockchainApiError } from '@/lib/errors';

describe('LiskAdapter.getTransactions', () => {
  const adapter = new LiskAdapter();
  const start = new Date('2024-01-01T00:00:00Z');
  const end   = new Date('2024-01-31T23:59:59Z');

  it('throws BlockchainApiError (service.lisk.com descomissionado)', async () => {
    await expect(
      adapter.getTransactions('lskdxc4ta5j43jp9ro3f8zqbxta9fn6jwzjucw64y', start, end, 'lisk')
    ).rejects.toBeInstanceOf(BlockchainApiError);
  });

  it('erro não é retryable', async () => {
    try {
      await adapter.getTransactions('lskdxc4ta5j43jp9ro3f8zqbxta9fn6jwzjucw64y', start, end, 'lisk');
      expect.fail('deveria ter lançado');
    } catch (err) {
      expect((err as BlockchainApiError).retryable).toBe(false);
    }
  });

  it('mensagem menciona migração L2', async () => {
    try {
      await adapter.getTransactions('lskdxc4ta5j43jp9ro3f8zqbxta9fn6jwzjucw64y', start, end, 'lisk');
      expect.fail('deveria ter lançado');
    } catch (err) {
      expect((err as Error).message).toMatch(/L2|migra|desativad/i);
    }
  });

  it('não faz nenhuma requisição de rede', async () => {
    const fetchSpy = vi.spyOn(global, 'fetch');
    try {
      await adapter.getTransactions('lskdxc4ta5j43jp9ro3f8zqbxta9fn6jwzjucw64y', start, end, 'lisk');
    } catch { /* esperado */ }
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });
});

describe('LiskAdapter metadata', () => {
  const adapter = new LiskAdapter();

  it('declara lisk como chain suportada', () => {
    expect(adapter.supportedChains).toContain('lisk');
  });

  it('tem um nome descritivo', () => {
    expect(typeof adapter.name).toBe('string');
    expect(adapter.name.length).toBeGreaterThan(0);
  });
});
