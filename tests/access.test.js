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
