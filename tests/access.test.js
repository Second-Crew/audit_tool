import { afterEach, describe, expect, it, vi } from 'vitest';
import { accessToken, timingSafeEqualHex } from '../lib/access.js';
import { middleware } from '../middleware.js';

afterEach(() => vi.unstubAllEnvs());

describe('accessToken', () => {
  it('is deterministic for the same password and differs across passwords', async () => {
    const [a, b, c] = await Promise.all([accessToken('hunter2'), accessToken('hunter2'), accessToken('other')]);
    expect(a).toBe(b);
    expect(a).not.toBe(c);
    expect(a).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe('production workspace gate', () => {
  it('fails closed when no team password is configured', async () => {
    vi.stubEnv('VERCEL_ENV', 'production');
    vi.stubEnv('APP_ACCESS_PASSWORD', '');
    const response = await middleware({ nextUrl: new URL('https://audit.example/api/analyze') });
    expect(response.status).toBe(503);
    expect(await response.text()).toContain('Workspace access is not configured');
  });

  it.each(['/api/history', '/api/audits/11000000-0000-0000-0000-000000000001', '/api/sends', '/api/analyze'])('rejects unauthenticated workspace API %s', async path => {
    vi.stubEnv('VERCEL_ENV', 'production');
    vi.stubEnv('APP_ACCESS_PASSWORD', 'test-team-password');
    const response = await middleware({ nextUrl: new URL(`https://audit.example${path}`), cookies: { get: () => undefined } });
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: 'Authentication required' });
  });

  it('requires login for workspace exports and allows a valid team cookie', async () => {
    vi.stubEnv('APP_ACCESS_PASSWORD', 'test-team-password');
    const nextUrl = new URL('https://audit.example/reports/11000000-0000-0000-0000-000000000001');
    const denied = await middleware({ nextUrl, url: nextUrl.href, cookies: { get: () => undefined } });
    expect(denied.status).toBe(307);
    expect(denied.headers.get('location')).toBe('https://audit.example/login');
    const token = await accessToken('test-team-password');
    const allowed = await middleware({ nextUrl, cookies: { get: () => ({ value: token }) } });
    expect(allowed.headers.get('x-middleware-next')).toBe('1');
  });

  it('allows prospect HTML links without a workspace cookie', async () => {
    vi.stubEnv('APP_ACCESS_PASSWORD', 'test-team-password');
    const response = await middleware({ nextUrl: new URL('https://audit.example/r/11000000-0000-0000-0000-000000000001') });
    expect(response.headers.get('x-middleware-next')).toBe('1');
  });
});

describe('timingSafeEqualHex', () => {
  it('matches only identical non-empty strings', () => {
    expect(timingSafeEqualHex('abc123', 'abc123')).toBe(true);
    expect(timingSafeEqualHex('abc123', 'abc124')).toBe(false);
    expect(timingSafeEqualHex('abc123', 'abc12')).toBe(false);
    expect(timingSafeEqualHex('', '')).toBe(false);
    expect(timingSafeEqualHex(null, null)).toBe(false);
  });
});
