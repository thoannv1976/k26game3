import { ApiError } from '../errors.js';

/** Runs fn with a timeout and a limited number of retries (exponential backoff). */
export async function withRetry<T>(fn: () => Promise<T>, opts: { retries: number; timeoutMs: number; baseDelayMs?: number }): Promise<T> {
  let lastErr: unknown;
  for (let attempt = 0; attempt <= opts.retries; attempt++) {
    try {
      return await withTimeout(fn(), opts.timeoutMs);
    } catch (e) {
      lastErr = e;
      if (e instanceof ApiError) throw e; // business errors are not retried
      if (attempt < opts.retries) await new Promise((r) => setTimeout(r, (opts.baseDelayMs ?? 300) * 2 ** attempt));
    }
  }
  throw lastErr;
}

export function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  let timer: NodeJS.Timeout;
  return Promise.race([
    p.finally(() => clearTimeout(timer)),
    new Promise<T>((_, reject) => {
      timer = setTimeout(() => reject(new Error(`Timed out after ${ms}ms`)), ms);
    }),
  ]);
}
