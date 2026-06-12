import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

interface WindowEntry {
  count: number;
  resetAt: number;
}

const store = new Map<string, WindowEntry>();

type RouteRule = {
  pattern: RegExp;
  method: string;
  limit: number;
  windowMs: number;
};

const RULES: RouteRule[] = [
  // Expensive: hits external blockchain APIs
  { pattern: /^\/api\/transactions$/, method: 'POST', limit: 5,  windowMs: 60_000 },
  // Moderate: hits external pricing APIs
  { pattern: /^\/api\/quotes$/,       method: 'POST', limit: 10, windowMs: 60_000 },
  // File generation
  { pattern: /^\/api\/export$/,       method: 'POST', limit: 10, windowMs: 60_000 },
  // Destructive: clears cached data
  { pattern: /^\/api\/settings$/,     method: 'POST', limit: 5,  windowMs: 300_000 },
  // Cheap reads — lenient
  { pattern: /^\/api\//,              method: 'GET',  limit: 60, windowMs: 60_000 },
];

function getIp(req: NextRequest): string {
  return (
    req.headers.get('x-forwarded-for')?.split(',')[0].trim() ??
    req.headers.get('x-real-ip') ??
    'unknown'
  );
}

function checkLimit(
  key: string,
  limit: number,
  windowMs: number,
): { allowed: boolean; remaining: number; resetAt: number } {
  const now   = Date.now();
  const entry = store.get(key);

  if (!entry || entry.resetAt < now) {
    store.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, remaining: limit - 1, resetAt: now + windowMs };
  }

  entry.count++;
  return {
    allowed:   entry.count <= limit,
    remaining: Math.max(0, limit - entry.count),
    resetAt:   entry.resetAt,
  };
}

function purgeExpired() {
  const now = Date.now();
  for (const [key, entry] of store) {
    if (entry.resetAt < now) store.delete(key);
  }
}

export function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const method = req.method;

  if (store.size > 0 && Math.random() < 0.02) purgeExpired();

  for (const rule of RULES) {
    if (rule.method !== method) continue;
    if (!rule.pattern.test(pathname)) continue;

    const ip  = getIp(req);
    const key = `${ip}:${method}:${pathname}`;
    const { allowed, remaining, resetAt } = checkLimit(key, rule.limit, rule.windowMs);

    const headers: Record<string, string> = {
      'X-RateLimit-Limit':     String(rule.limit),
      'X-RateLimit-Remaining': String(remaining),
      'X-RateLimit-Reset':     String(Math.ceil(resetAt / 1000)),
    };

    if (!allowed) {
      return NextResponse.json(
        {
          error: 'RATE_LIMIT_EXCEEDED',
          message: 'Muitas requisições. Tente novamente em instantes.',
        },
        {
          status: 429,
          headers: {
            ...headers,
            'Retry-After': String(Math.ceil((resetAt - Date.now()) / 1000)),
          },
        },
      );
    }

    const res = NextResponse.next();
    for (const [k, v] of Object.entries(headers)) res.headers.set(k, v);
    return res;
  }

  return NextResponse.next();
}

export const config = {
  matcher: '/api/:path*',
};
