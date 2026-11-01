import { GoogleAuth } from 'google-auth-library';
import type { LearningEvidence } from '@vq/shared';

export interface PeerResult {
  source: 'english-city-simulator' | 'english-detective';
  ok: boolean;
  items: LearningEvidence[];
  error: string | null;
}

/** Read-only access to the learner evidence of Game 1 (City) and Game 2 (Detective). */
export interface PeerClient {
  evidence(tenantId: string, uid: string): Promise<PeerResult[]>;
}

export class NoPeerClient implements PeerClient {
  async evidence(): Promise<PeerResult[]> {
    return [];
  }
}

/** Test double. */
export class StaticPeerClient implements PeerClient {
  constructor(private readonly results: PeerResult[]) {}
  async evidence(): Promise<PeerResult[]> {
    return this.results;
  }
}

/**
 * Calls `GET {peer}/api/lms/v1/learners/{uid}/evidence` on each peer Cloud Run service with a Google-signed
 * ID token of this service's account (audience = peer URL) and the tenant in `X-K26-Tenant`.
 * Peers are optional: failures and timeouts are reported per source and never break the profile page.
 */
export class HttpPeerClient implements PeerClient {
  private readonly auth = new GoogleAuth();
  constructor(
    private readonly cityUrl: string,
    private readonly detectiveUrl: string,
    private readonly timeoutMs = 5000,
  ) {}

  async evidence(tenantId: string, uid: string): Promise<PeerResult[]> {
    const peers = [
      { source: 'english-city-simulator' as const, url: this.cityUrl },
      { source: 'english-detective' as const, url: this.detectiveUrl },
    ].filter((p) => p.url);
    return Promise.all(peers.map((p) => this.fetchOne(p.source, p.url, tenantId, uid)));
  }

  private async fetchOne(source: PeerResult['source'], baseUrl: string, tenantId: string, uid: string): Promise<PeerResult> {
    const base = baseUrl.replace(/\/+$/, '');
    try {
      const client = await this.auth.getIdTokenClient(base);
      const headers = await client.getRequestHeaders();
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), this.timeoutMs);
      try {
        const res = await fetch(`${base}/api/lms/v1/learners/${encodeURIComponent(uid)}/evidence?limit=50`, {
          headers: { ...Object.fromEntries(headers instanceof Headers ? headers.entries() : Object.entries(headers as Record<string, string>)), 'X-K26-Tenant': tenantId },
          signal: ctrl.signal,
        });
        if (!res.ok) return { source, ok: false, items: [], error: `HTTP ${res.status}` };
        const body = (await res.json()) as { items?: LearningEvidence[] };
        const items = (body.items ?? []).filter((e) => e && e.schema === 'k26-evidence-1.0' && e.learner?.uid === uid);
        return { source, ok: true, items, error: null };
      } finally {
        clearTimeout(timer);
      }
    } catch (e) {
      return { source, ok: false, items: [], error: (e as Error).name === 'AbortError' ? 'timeout' : (e as Error).message.slice(0, 200) };
    }
  }
}
