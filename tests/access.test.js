import { describe, expect, it } from 'vitest';
import { accessToken, timingSafeEqualHex } from '../lib/access.js';

describe('accessToken', () => {
  it('is deterministic for the same password and differs across passwords', async () => {
    const [a, b, c] = await Promise.all([accessToken('hunter2'), accessToken('hunter2'), accessToken('other')]);
    expect(a).toBe(b);
    expect(a).not.toBe(c);
    expect(a).toMatch(/^[0-9a-f]{64}$/);
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
