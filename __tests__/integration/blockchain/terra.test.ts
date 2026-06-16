import { describe, it, expect } from 'vitest';
import { TerraAdapter } from '@/lib/blockchain/terra';
import { BlockchainApiError } from '@/lib/errors';

describe('TerraAdapter.getTransactions', () => {
  const adapter = new TerraAdapter();
  const start = new Date('2024-01-01T00:00:00Z');
  const end   = new Date('2024-01-31T23:59:59Z');

  it('throws BlockchainApiError immediately (FCD endpoint is decommissioned)', async () => {
    await expect(
      adapter.getTransactions('terra1x46rqay4d3cssq8gxxvqz8xt6nwlz4td20435', start, end, 'terra')
    ).rejects.toBeInstanceOf(BlockchainApiError);
  });

  it('error is not retryable', async () => {
    try {
      await adapter.getTransactions('terra1abc', start, end, 'terra');
      expect.fail('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(BlockchainApiError);
      expect((err as BlockchainApiError).retryable).toBe(false);
    }
  });

  it('error message mentions the endpoint is disabled', async () => {
    try {
      await adapter.getTransactions('terra1abc', start, end, 'terra');
      expect.fail('should have thrown');
    } catch (err) {
      expect((err as Error).message).toMatch(/desativado|indispon/i);
    }
  });

  it('does not make any network requests', async () => {
    const fetchSpy = vi.spyOn(global, 'fetch');
    try {
      await adapter.getTransactions('terra1abc', start, end, 'terra');
    } catch {
      // expected
    }
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });
});

describe('TerraAdapter metadata', () => {
  const adapter = new TerraAdapter();

  it('declares terra as supported chain', () => {
    expect(adapter.supportedChains).toContain('terra');
  });

  it('has a descriptive name', () => {
    expect(typeof adapter.name).toBe('string');
    expect(adapter.name.length).toBeGreaterThan(0);
  });
});
