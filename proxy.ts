import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { checkRateLimit } from '@/lib/ratelimit';

type RouteRule = {
  pattern: RegExp;
  method:  string;
  ruleId:  string;
};

const RULES: RouteRule[] = [
  { pattern: /^\/api\/transactions$/, method: 'POST', ruleId: 'transactions' },
  { pattern: /^\/api\/quotes$/,       method: 'POST', ruleId: 'quotes'       },
  { pattern: /^\/api\/export$/,       method: 'POST', ruleId: 'export'       },
  { pattern: /^\/api\/batch$/,        method: 'POST', ruleId: 'batch'        },
  { pattern: /^\/api\/settings$/,     method: 'POST', ruleId: 'settings'     },
  { pattern: /^\/api\//,              method: 'GET',  ruleId: 'read'         },
];

function getIp(req: NextRequest): string {
  return (
    req.headers.get('x-forwarded-for')?.split(',')[0].trim() ??
    req.headers.get('x-real-ip') ??
    'unknown'
  );
}

export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const method       = req.method;

  for (const rule of RULES) {
    if (rule.method !== method)          continue;
    if (!rule.pattern.test(pathname))    continue;

    const ip         = getIp(req);
    const identifier = `${ip}:${method}:${pathname}`;
    const { allowed, remaining, resetAt, limit } =
      await checkRateLimit(identifier, rule.ruleId);

    const headers: Record<string, string> = {
      'X-RateLimit-Limit':     String(limit),
      'X-RateLimit-Remaining': String(remaining),
      'X-RateLimit-Reset':     String(Math.ceil(resetAt / 1000)),
    };

    if (!allowed) {
      return NextResponse.json(
        {
          error:   'RATE_LIMIT_EXCEEDED',
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
