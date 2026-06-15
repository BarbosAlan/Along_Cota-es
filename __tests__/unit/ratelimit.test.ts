import { describe, it, expect } from 'vitest';
import { checkRateLimit, RULES, isUpstashEnabled } from '@/lib/ratelimit';

// Each test uses a unique identifier so tests don't share in-memory state.
let seq = 0;
const uid = (prefix: string) => `${prefix}-${++seq}-${Math.random().toString(36).slice(2, 8)}`;

describe('RULES configuration', () => {
  it('defines all expected rules', () => {
    const expected = ['transactions', 'quotes', 'export', 'batch', 'settings', 'read', 'coingecko'];
    for (const key of expected) {
      expect(RULES).toHaveProperty(key);
    }
  });

  it('coingecko rule respects the free-tier budget', () => {
    expect(RULES.coingecko.limit).toBe(25);
    expect(RULES.coingecko.windowMs).toBe(60_000);
  });

  it('batch rule is more restrictive than quotes', () => {
    expect(RULES.batch.limit).toBeLessThan(RULES.quotes.limit);
  });

  it('settings rule has a longer window (5 min)', () => {
    expect(RULES.settings.windowMs).toBe(300_000);
  });
});

describe('isUpstashEnabled', () => {
  it('is false in the test environment (no env vars set)', () => {
    expect(isUpstashEnabled).toBe(false);
  });
});

describe('checkRateLimit (in-memory fallback)', () => {
  it('throws for an unknown rule', async () => {
    await expect(checkRateLimit(uid('x'), 'ghost_rule')).rejects.toThrow(
      'Unknown rate-limit rule'
    );
  });

  it('allows the first request and returns correct metadata', async () => {
    const r = await checkRateLimit(uid('u'), 'read');
    expect(r.allowed).toBe(true);
    expect(r.limit).toBe(RULES.read.limit);
    expect(r.remaining).toBe(RULES.read.limit - 1);
    expect(r.resetAt).toBeGreaterThan(Date.now());
  });

  it('decrements remaining on every call for the same identifier', async () => {
    const id = uid('dec');
    const first = await checkRateLimit(id, 'export');
    const second = await checkRateLimit(id, 'export');
    expect(second.remaining).toBe(first.remaining - 1);
  });

  it('blocks requests once the limit is exhausted', async () => {
    const id = uid('block');
    const { limit } = RULES.batch; // 3

    for (let i = 0; i < limit; i++) {
      const r = await checkRateLimit(id, 'batch');
      expect(r.allowed).toBe(true);
    }

    const blocked = await checkRateLimit(id, 'batch');
    expect(blocked.allowed).toBe(false);
    expect(blocked.remaining).toBe(0);
  });

  it('blocked response still reports the correct limit', async () => {
    const id = uid('lim');
    const { limit } = RULES.transactions; // 5

    for (let i = 0; i <= limit; i++) {
      await checkRateLimit(id, 'transactions');
    }

    const blocked = await checkRateLimit(id, 'transactions');
    expect(blocked.limit).toBe(limit);
  });

  it('different identifiers do not share quota', async () => {
    const id1 = uid('sep1');
    const id2 = uid('sep2');
    const { limit } = RULES.batch;

    // Exhaust limit for id1
    for (let i = 0; i <= limit; i++) {
      await checkRateLimit(id1, 'batch');
    }

    // id2 should still be allowed
    const r = await checkRateLimit(id2, 'batch');
    expect(r.allowed).toBe(true);
  });

  it('resetAt is in the future for a fresh window', async () => {
    const before = Date.now();
    const r = await checkRateLimit(uid('reset'), 'quotes');
    expect(r.resetAt).toBeGreaterThan(before);
    expect(r.resetAt).toBeLessThanOrEqual(before + RULES.quotes.windowMs + 50);
  });
});
