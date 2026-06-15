import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  BlockchainApiError,
  PricingApiError,
  PtaxNotFoundError,
  ValidationError,
  withRetry,
  fetchWithTimeout,
} from '@/lib/errors';

// ── Custom error classes ────────────────────────────────────────────────────

describe('BlockchainApiError', () => {
  it('has correct name and properties', () => {
    const err = new BlockchainApiError('ethereum', 429, 'Rate limited', true);
    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe('BlockchainApiError');
    expect(err.chain).toBe('ethereum');
    expect(err.statusCode).toBe(429);
    expect(err.message).toBe('Rate limited');
    expect(err.retryable).toBe(true);
  });

  it('non-retryable flag is preserved', () => {
    const err = new BlockchainApiError('bitcoin', 400, 'Bad request', false);
    expect(err.retryable).toBe(false);
  });
});

describe('PricingApiError', () => {
  it('has correct name and properties', () => {
    const err = new PricingApiError('binance', 'HTTP 503');
    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe('PricingApiError');
    expect(err.source).toBe('binance');
    expect(err.message).toBe('HTTP 503');
  });
});

describe('PtaxNotFoundError', () => {
  it('has correct name, date and message', () => {
    const err = new PtaxNotFoundError('2024-01-01');
    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe('PtaxNotFoundError');
    expect(err.date).toBe('2024-01-01');
    expect(err.message).toContain('2024-01-01');
  });
});

describe('ValidationError', () => {
  it('stores arbitrary details', () => {
    const details = { field: 'walletAddress', issue: 'too short' };
    const err = new ValidationError(details);
    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe('ValidationError');
    expect(err.details).toEqual(details);
    expect(err.message).toBe('Validation failed');
  });
});

// ── withRetry ───────────────────────────────────────────────────────────────

describe('withRetry', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('returns immediately on first success without retrying', async () => {
    const fn = vi.fn().mockResolvedValue('ok');
    const result = await withRetry(fn, 3, 10);
    expect(result).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('retries on generic Error and succeeds on second attempt', async () => {
    const fn = vi.fn()
      .mockRejectedValueOnce(new Error('transient'))
      .mockResolvedValue('recovered');

    const promise = withRetry(fn, 3, 10);
    await vi.runAllTimersAsync();
    expect(await promise).toBe('recovered');
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('retries up to maxAttempts times then throws', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('always fails'));

    const promise = withRetry(fn, 3, 10);
    // Attach rejection handler BEFORE running timers to avoid unhandled-rejection warning
    const assertion = expect(promise).rejects.toThrow('always fails');
    await vi.runAllTimersAsync();
    await assertion;
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('does NOT retry a non-retryable BlockchainApiError', async () => {
    const err = new BlockchainApiError('ethereum', 400, 'Invalid address', false);
    const fn = vi.fn().mockRejectedValue(err);

    await expect(withRetry(fn, 3, 10)).rejects.toThrow(err);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('retries a retryable BlockchainApiError', async () => {
    const retryable = new BlockchainApiError('solana', 429, 'Rate limited', true);
    const fn = vi.fn()
      .mockRejectedValueOnce(retryable)
      .mockResolvedValue('ok');

    const promise = withRetry(fn, 3, 10);
    await vi.runAllTimersAsync();
    expect(await promise).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(2);
  });
});

// ── fetchWithTimeout ────────────────────────────────────────────────────────

describe('fetchWithTimeout', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('returns a successful response', async () => {
    const mockResponse = { ok: true, status: 200, json: () => Promise.resolve({ data: 1 }) };
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(mockResponse));

    const res = await fetchWithTimeout('https://example.com/api');
    expect(res.ok).toBe(true);
    expect(res.status).toBe(200);
  });

  it('aborts request after timeout', async () => {
    vi.useFakeTimers();

    vi.stubGlobal('fetch', vi.fn().mockImplementation((_url, opts) => {
      return new Promise((_resolve, reject) => {
        opts.signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
      });
    }));

    const promise = fetchWithTimeout('https://example.com/api', {}, 100);
    vi.advanceTimersByTime(200);
    await expect(promise).rejects.toThrow();

    vi.useRealTimers();
  });
});
