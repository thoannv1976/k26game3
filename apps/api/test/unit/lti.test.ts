import { describe, expect, it } from 'vitest';
import { loadConfig, parseTenantMap } from '../../src/config.js';
import { parseActivity } from '../../src/lti/launch.js';

describe('LTI config', () => {
  it('parses the tenant map in deploy (a=b;c=d) and JSON form', () => {
    expect(parseTenantMap('')).toEqual({});
    expect(parseTenantMap(' aiedu2026 = aiedu2026 ; aiedu-local=demo-university;bad ')).toEqual({ aiedu2026: 'aiedu2026', 'aiedu-local': 'demo-university' });
    expect(parseTenantMap('{"hub":"app"}')).toEqual({ hub: 'app' });
  });

  it('refuses to start in production with LTI enabled but not configured', () => {
    const prod = { env: 'production', aiProvider: 'vertex', speechProvider: 'google', ttsProvider: 'google', blobStore: 'gcs' } as const;
    expect(() => loadConfig({ ...prod, ltiEnabled: true, ltiHubUrl: 'http://hub', ltiGameSecret: 'short', ltiTenantMap: {} })).toThrow(/LTI_HUB_URL.*LTI_GAME_SECRET.*LTI_TENANT_MAP/);
    expect(() => loadConfig({ ...prod, ltiEnabled: true, ltiHubUrl: 'https://hub', ltiGameSecret: 'x'.repeat(40), ltiTenantMap: { a: 'b' } })).not.toThrow();
    expect(loadConfig({ env: 'test' }).ltiGameId).toBe('k26game3');
  });
});

describe('LTI activity ids', () => {
  it('maps quest ids and mock exam ids; anything else is ignored', () => {
    expect(parseActivity('L01')).toEqual({ kind: 'quest', refId: 'L01' });
    expect(parseActivity('S02')).toEqual({ kind: 'quest', refId: 'S02' });
    expect(parseActivity('mx1')).toEqual({ kind: 'exam', refId: 'mx1' });
    expect(parseActivity(undefined)).toBeNull();
    expect(parseActivity('')).toBeNull();
    expect(parseActivity('M01')).toBeNull();
    expect(parseActivity('../x')).toBeNull();
  });
});
