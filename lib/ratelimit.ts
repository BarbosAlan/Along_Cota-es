import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';

// ── In-memory fallback (dev / single-instance) ────────────────────────────
interface WindowEntry { count: number; resetAt: number }
const store = new Map<string, WindowEntry>();
const MAX_STORE_SIZE = 5_000;

function pruneExpired(): void {
  const now = Date.now();
  for (const [key, entry] of store) {
    if (entry.resetAt < now) store.delete(key);
  }
}

function memCheck(
  key: string,
  limit: number,
  windowMs: number,
): { allowed: boolean; remaining: number; resetAt: number; limit: number } {
  const now   = Date.now();
  const entry = store.get(key);
  if (!entry || entry.resetAt < now) {
    store.set(key, { count: 1, resetAt: now + windowMs });
    if (store.size > MAX_STORE_SIZE) pruneExpired();
    return { allowed: true, remaining: limit - 1, resetAt: now + windowMs, limit };
  }
  entry.count++;
  return {
    allowed:   entry.count <= limit,
    remaining: Math.max(0, limit - entry.count),
    resetAt:   entry.resetAt,
    limit,
  };
}

// ── Upstash setup ─────────────────────────────────────────────────────────
export const isUpstashEnabled = !!(
  process.env.UPSTASH_REDIS_REST_URL &&
  process.env.UPSTASH_REDIS_REST_TOKEN
);

type RuleConfig = { limit: number; windowMs: number; upstashWindow: string };

export const RULES: Record<string, RuleConfig> = {
  transactions: { limit: 5,  windowMs: 60_000,  upstashWindow: '60 s' },
  quotes:       { limit: 10, windowMs: 60_000,  upstashWindow: '60 s' },
  export:       { limit: 10, windowMs: 60_000,  upstashWindow: '60 s' },
  batch:        { limit: 3,  windowMs: 60_000,  upstashWindow: '60 s' },
  settings:     { limit: 5,  windowMs: 300_000, upstashWindow: '300 s' },
  read:         { limit: 60, windowMs: 60_000,  upstashWindow: '60 s' },
  // Global CoinGecko quota shared across all requests (25 = free tier 30 minus buffer)
  coingecko:    { limit: 25, windowMs: 60_000,  upstashWindow: '60 s' },
};

// One Ratelimit instance per rule, created once at module load
const upstashLimiters = new Map<string, Ratelimit>();

if (isUpstashEnabled) {
  const redis = new Redis({
    url:   process.env.UPSTASH_REDIS_REST_URL!,
    token: process.env.UPSTASH_REDIS_REST_TOKEN!,
  });

  for (const [id, cfg] of Object.entries(RULES)) {
    upstashLimiters.set(
      id,
      new Ratelimit({
        redis,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        limiter: Ratelimit.fixedWindow(cfg.limit, cfg.upstashWindow as any),
        prefix:  `rl:${id}`,
      }),
    );
  }
}

// ── Public API ────────────────────────────────────────────────────────────
export async function checkRateLimit(
  identifier: string,
  ruleId: string,
): Promise<{ allowed: boolean; remaining: number; resetAt: number; limit: number }> {
  const cfg = RULES[ruleId];
  if (!cfg) throw new Error(`Unknown rate-limit rule: ${ruleId}`);

  const upstash = upstashLimiters.get(ruleId);
  if (upstash) {
    const r = await upstash.limit(identifier);
    return {
      allowed:   r.success,
      remaining: r.remaining,
      resetAt:   r.reset,
      limit:     r.limit,
    };
  }

  return memCheck(identifier, cfg.limit, cfg.windowMs);
}
