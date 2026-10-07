import { afterEach, describe, expect, it, vi } from 'vitest';
vi.mock('../lib/audit/fetcher.js', () => ({ fetchText: vi.fn() }));
import { fetchText } from '../lib/audit/fetcher.js';
import { crawlSite } from '../lib/audit/crawler.js';
afterEach(() => { vi.restoreAllMocks(); vi.clearAllMocks(); });
describe('shared crawl deadline', () => {
  it('does not fetch auxiliary files or pages after the request work deadline', async () => {
    const result = await crawlSite('https://example.com/', { deadlineMs: Date.now() - 1 });
    expect(fetchText).not.toHaveBeenCalled();
    expect(result.pages).toEqual([]);
    expect(result.auxiliary.robots.status).toBe(0);
    expect(result.summary.stoppedBy).toBe('time_limit');
  });
  it('bounds sitemap recursion by remaining time rather than fifteen independent timeouts', async () => {
    let now = 1000;
    vi.spyOn(Date, 'now').mockImplementation(() => now);
    fetchText.mockImplementation(async (url, options) => {
      if (url.endsWith('sitemap.xml')) return { ok: true, status: 200, body: '<sitemapindex><sitemap><loc>https://example.com/child-one.xml</loc></sitemap><sitemap><loc>https://example.com/child-two.xml</loc></sitemap></sitemapindex>' };
      if (url.endsWith('child-one.xml')) { expect(options.timeoutMs).toBe(100); now = 1100; }
      return { ok: false, status: 404, body: '' };
    });
    const result = await crawlSite('https://example.com/', { deadlineMs: 1100, requestTimeoutMs: 10000 });
    expect(fetchText.mock.calls.map(c => c[0])).not.toContain('https://example.com/child-two.xml');
    expect(result.summary.stoppedBy).toBe('time_limit');
    expect(result.pages).toEqual([]);
  });
});
