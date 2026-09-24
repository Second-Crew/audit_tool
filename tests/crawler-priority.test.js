import { describe, expect, it, vi } from 'vitest';

vi.mock('../lib/audit/fetcher.js', () => ({
  fetchText: vi.fn(async (url) => {
    const pathname = new URL(url).pathname;
    if (pathname === '/robots.txt') return { ok: true, status: 200, url, body: 'User-agent: *\nAllow: /', headers: {} };
    if (pathname === '/llms.txt') return { ok: false, status: 404, url, body: '', headers: {} };
    if (pathname === '/sitemap.xml') return {
      ok: true, status: 200, url,
      body: `<urlset>${Array.from({ length: 20 }, (_, index) => `<url><loc>https://example.com/blog/service-vs-product-${index}</loc></url>`).join('')}<url><loc>https://example.com/about</loc></url><url><loc>https://example.com/services</loc></url></urlset>`,
      headers: {},
    };
    return { ok: true, status: 200, url, body: `<html><head><title>${pathname}</title></head><body><main><h1>${pathname}</h1><p>Useful page content.</p></main></body></html>`, headers: { 'content-type': 'text/html' } };
  }),
}));

import { crawlSite } from '../lib/audit/crawler.js';
import { fetchText } from '../lib/audit/fetcher.js';

describe('crawl sampling priority', () => {
  it('includes the homepage and core pages before sitemap articles under a small limit', async () => {
    const crawl = await crawlSite('https://example.com/', {
      maxPages: 3,
      maxDurationMs: 5000,
      concurrency: 1,
      requestDelayMs: 0,
    });
    expect(crawl.pages.map((page) => new URL(page.url).pathname)).toEqual(['/', '/about', '/services']);
  });

  it('does not fetch beyond the requested page limit with concurrent workers', async () => {
    fetchText.mockClear();
    const crawl = await crawlSite('https://example.com/', {
      maxPages: 3,
      maxDurationMs: 5000,
      concurrency: 3,
      requestDelayMs: 0,
    });
    const pageRequests = fetchText.mock.calls.filter(([url]) => !['/robots.txt', '/llms.txt', '/sitemap.xml'].includes(new URL(url).pathname));
    expect(pageRequests).toHaveLength(3);
    expect(crawl.pages).toHaveLength(3);
    expect(crawl.summary.crawledPages).toBe(3);
  });
});
