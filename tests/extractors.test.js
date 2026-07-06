import { describe, expect, it } from 'vitest';
import { buildFreshnessPattern, extractSiteSignals } from '../lib/audit/extractors.js';
import { parseRobotsTxt } from '../lib/audit/robots.js';

function makeCrawl(pages) {
  const robotsBody = 'User-agent: *\nAllow: /';
  return {
    domain: 'example.com',
    startUrl: 'https://example.com/',
    origin: 'https://example.com',
    pages: pages.map((page, index) => ({
      url: page.url || `https://example.com/page-${index}`,
      requestedUrl: page.url || `https://example.com/page-${index}`,
      status: 200,
      headers: { 'content-type': 'text/html; charset=utf-8' },
      html: page.html || '<html><head><title>Page</title></head><body><p>Hello</p></body></html>',
      truncated: false,
      discoveredLinks: [],
    })),
    auxiliary: {
      robots: { url: 'https://example.com/robots.txt', found: true, status: 200, body: robotsBody, parsed: parseRobotsTxt(robotsBody) },
      llms: { url: 'https://example.com/llms.txt', found: false, status: 404, body: '' },
      sitemap: { url: 'https://example.com/sitemap.xml', found: false, status: 404, urls: [] },
    },
    errors: [],
    blockedByRobots: [],
    summary: { requestedMaxPages: 10, crawledPages: pages.length, failedRequests: 0, blockedByRobots: 0, elapsedMs: 5, stoppedBy: 'queue_empty' },
  };
}

function pageWithJsonLd(url, blocks) {
  const scripts = blocks
    .map((block) => `<script type="application/ld+json">${typeof block === 'string' ? block : JSON.stringify(block)}</script>`)
    .join('\n');
  return {
    url,
    html: `<html><head><title>Test</title>${scripts}</head><body><p>Body text</p></body></html>`,
  };
}

describe('JSON-LD aggregation', () => {
  it('flattens @graph and array documents into site-level schema nodes and deduped types', () => {
    const crawl = makeCrawl([
      pageWithJsonLd('https://example.com', [
        {
          '@context': 'https://schema.org',
          '@graph': [
            { '@type': 'Organization', name: 'Example Co' },
            { '@type': 'FAQPage', name: 'FAQ' },
          ],
        },
      ]),
      pageWithJsonLd('https://example.com/services', [
        [
          { '@type': 'Product', name: 'Widget' },
          { '@type': ['Service', 'LocalBusiness'], name: 'Install' },
        ],
        { '@type': 'Organization', name: 'Example Co again' },
      ]),
    ]);

    const signals = extractSiteSignals(crawl);

    expect(signals.schema.found).toBe(true);
    expect(signals.schema.count).toBe(5);
    expect(signals.schema.types.sort()).toEqual(['FAQPage', 'LocalBusiness', 'Organization', 'Product', 'Service']);
    expect(signals.schema.hasFAQ).toBe(true);
    expect(signals.schema.hasLocalBusiness).toBe(true);
    expect(signals.schema.hasProduct).toBe(true);
    expect(signals.schema.hasService).toBe(true);
    expect(signals.schema.invalidCount).toBe(0);
  });

  it('counts invalid JSON-LD blocks without dropping valid ones', () => {
    const crawl = makeCrawl([
      pageWithJsonLd('https://example.com', [
        { '@type': 'Organization', name: 'Example Co' },
        '{ this is not valid json',
      ]),
    ]);

    const signals = extractSiteSignals(crawl);

    expect(signals.schema.count).toBe(1);
    expect(signals.schema.invalidCount).toBe(1);
    expect(signals.schema.invalidBlocks[0].url).toBe('https://example.com');
    expect(signals.schema.invalidBlocks[0].sample).toContain('this is not valid json');
  });

  it('records per-page schema counts used by the action plan', () => {
    const crawl = makeCrawl([
      pageWithJsonLd('https://example.com', [{ '@type': 'WebSite', name: 'Example' }]),
      { url: 'https://example.com/bare', html: '<html><head><title>Bare</title></head><body>No schema</body></html>' },
    ]);

    const signals = extractSiteSignals(crawl);

    expect(signals.pages[0].schema.count).toBe(1);
    expect(signals.pages[1].schema.count).toBe(0);
    expect(signals.pages[1].schema.found).toBe(false);
  });
});

describe('freshness signals', () => {
  it('builds the year pattern from the given year and its predecessor', () => {
    const pattern = buildFreshnessPattern(2030);
    expect(pattern.test('Copyright 2030')).toBe(true);
    expect(pattern.test('As of 2029, we serve 40 cities')).toBe(true);
    expect(pattern.test('Founded in 2010')).toBe(false);
    expect(pattern.test('12030 units sold in 12019')).toBe(false);
  });

  it('still matches explicit freshness language regardless of year', () => {
    const pattern = buildFreshnessPattern(2030);
    expect(pattern.test('Last updated: March')).toBe(true);
    expect(pattern.test('our latest work')).toBe(true);
  });

  it('detects the runtime current year in crawled text', () => {
    const year = new Date().getFullYear();
    const crawl = makeCrawl([
      { url: 'https://example.com', html: `<html><head><title>T</title></head><body>© ${year} Example Co</body></html>` },
    ]);

    expect(extractSiteSignals(crawl).content.hasFreshnessSignals).toBe(true);
  });

  it('does not treat stale years alone as freshness', () => {
    const crawl = makeCrawl([
      { url: 'https://example.com', html: '<html><head><title>T</title></head><body>© 2019 Example Co</body></html>' },
    ]);

    expect(extractSiteSignals(crawl).content.hasFreshnessSignals).toBe(false);
  });
});
