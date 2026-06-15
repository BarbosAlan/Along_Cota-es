import type { BlockchainId, PriceSource } from '@/types';

export class BlockchainApiError extends Error {
  constructor(
    public readonly chain: BlockchainId,
    public readonly statusCode: number,
    message: string,
    public readonly retryable: boolean
  ) {
    super(message);
    this.name = 'BlockchainApiError';
  }
}

export class PricingApiError extends Error {
  constructor(
    public readonly source: PriceSource | string,
    message: string
  ) {
    super(message);
    this.name = 'PricingApiError';
  }
}

export class PtaxNotFoundError extends Error {
  constructor(public readonly date: string) {
    super(`No PTAX rate found for or before ${date}`);
    this.name = 'PtaxNotFoundError';
  }
}

export class ValidationError extends Error {
  constructor(public readonly details: unknown) {
    super('Validation failed');
    this.name = 'ValidationError';
  }
}

export async function fetchWithTimeout(
  input: string | URL,
  init?: RequestInit,
  timeoutMs = 15_000
): Promise<Response> {
  const controller = new AbortController();
  const tid = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(tid);
  }
}

export async function withRetry<T>(
  fn: () => Promise<T>,
  maxAttempts = 3,
  delayMs = 1000
): Promise<T> {
  let lastError: Error | undefined;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      if (err instanceof BlockchainApiError && !err.retryable) throw err;
      lastError = err as Error;
      if (attempt < maxAttempts) {
        await new Promise(r => setTimeout(r, delayMs * attempt));
      }
    }
  }
  throw lastError;
}
