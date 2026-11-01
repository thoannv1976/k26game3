import type { ApiErrorCode } from '@vq/shared';
import { auth } from '../firebase';

/** Error returned by the API as `{ error: { code, message, details } }`. */
export class ApiError extends Error {
  constructor(
    readonly code: ApiErrorCode | 'NETWORK' | string,
    message: string,
    readonly status: number,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export function isApiError(e: unknown, code?: string): e is ApiError {
  return e instanceof ApiError && (code === undefined || e.code === code);
}

async function token(forceRefresh = false): Promise<string | null> {
  const u = auth.currentUser;
  if (!u) return null;
  return u.getIdToken(forceRefresh);
}

async function authHeaders(): Promise<Record<string, string>> {
  const t = await token();
  return t ? { Authorization: `Bearer ${t}` } : {};
}

async function toApiError(res: Response): Promise<ApiError> {
  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    /* not JSON */
  }
  const err = (body as { error?: { code?: string; message?: string; details?: unknown } } | null)?.error;
  return new ApiError(err?.code ?? (res.status === 401 ? 'UNAUTHENTICATED' : 'INTERNAL'), err?.message ?? res.statusText, res.status, err?.details);
}

async function send(path: string, init: RequestInit): Promise<Response> {
  let res: Response;
  try {
    res = await fetch(path, init);
  } catch (e) {
    throw new ApiError('NETWORK', (e as Error).message || 'Network error', 0);
  }
  if (!res.ok) throw await toApiError(res);
  return res;
}

export async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const headers: Record<string, string> = { ...(await authHeaders()) };
  let payload: BodyInit | undefined;
  if (body instanceof FormData) payload = body;
  else if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
    payload = JSON.stringify(body);
  }
  const res = await send(path, { method, headers, body: payload });
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export const api = {
  get: <T>(path: string) => request<T>('GET', path),
  post: <T>(path: string, body: unknown = {}) => request<T>('POST', path, body),
  put: <T>(path: string, body: unknown) => request<T>('PUT', path, body),
  patch: <T>(path: string, body: unknown) => request<T>('PATCH', path, body),
  delete: <T>(path: string) => request<T>('DELETE', path),
  /** Authenticated binary download (audio, CSV). */
  async blob(path: string): Promise<Blob> {
    const res = await send(path, { method: 'GET', headers: await authHeaders() });
    return res.blob();
  },
};

/** Forces a fresh ID token (new custom claims after self-provisioning). */
export async function refreshIdToken() {
  await token(true);
}

/** Query-string helper that skips empty values. */
export function qs(params: Record<string, string | number | undefined | null>): string {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null && v !== '') sp.set(k, String(v));
  const s = sp.toString();
  return s ? `?${s}` : '';
}
