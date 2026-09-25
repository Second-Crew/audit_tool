import { afterEach, describe, expect, it, vi } from 'vitest';
import { getPageSpeedBundle } from '../lib/audit/pagespeed.js';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('PageSpeed availability', () => {
  it('retries a transient desktop failure without inventing a score', async () => {
    const desktopFailure = { ok: false, status: 503, text: async () => 'temporarily unavailable' };
    const result = (score) => ({ ok: true, json: async () => ({ lighthouseResult: { categories: { performance: { score } } } }) });
    let desktopCalls = 0;
    const fetchMock = vi.fn(async (url) => {
      if (url.includes('strategy=mobile')) return result(0.5);
      desktopCalls += 1;
      return desktopCalls === 1 ? desktopFailure : result(0.8);
    });
    vi.stubGlobal('fetch', fetchMock);
    const bundle = await getPageSpeedBundle('https://agency.example/');
    expect(bundle.scores).toMatchObject({ mobile: 50, desktop: 80 });
    expect(desktopCalls).toBe(2);
  });

  it('does not retry a permission error and leaves the unavailable score null', async () => {
    const fetchMock = vi.fn(async () => ({ ok: false, status: 403, text: async () => 'forbidden' }));
    vi.stubGlobal('fetch', fetchMock);
    const bundle = await getPageSpeedBundle('https://agency.example/');
    expect(bundle.scores).toMatchObject({ mobile: null, desktop: null });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
