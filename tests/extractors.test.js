import { describe, expect, it } from 'vitest';
import { buildFreshnessPattern, extractSiteSignals } from '../lib/audit/extractors.js';
import { scoreSite } from '../lib/audit/scoring.js';
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

describe('page purpose classification', () => {
  it('retains visible footer contact details without importing navigation into content evidence', () => {
    const signals = extractSiteSignals(makeCrawl([{
      url:'https://agency.example/',
      html:'<html><body><main><p>We design and build useful websites for companies. Explore our work and learn how our experienced team approaches each project.</p></main><footer><p>(650) 924-9903</p><a href="mailto:hello@example.com">hello@example.com</a><p hidden>hidden@example.com</p></footer><script>secret@example.com</script></body></html>',
    }]));
    expect(signals.local.phones).toEqual(['(650) 924-9903']);
    expect(signals.local.emails).toEqual(['hello@example.com']);
    expect(signals.pages[0].text).not.toContain('hello@example.com');
    expect(scoreSite(signals).categoryDetails.entityTrust.checks.find(check=>check.label==='Public phone or email details').status).toBe('passed');
  });
  it('recognizes an external proposal form as a public contact path without inventing a contact page', () => {
    const crawl = makeCrawl([{
      url: 'https://agency.example/',
      html: '<html><head><title>Agency</title></head><body><header><a href="https://form.typeform.com/to/Cis8by">Request a Proposal</a></header><main><h1>Web design</h1><p>Our team designs and builds websites for local companies. We explain the process and show project examples so visitors can decide whether to ask for a proposal.</p></main></body></html>',
    }]);
    const signals = extractSiteSignals(crawl);
    expect(signals.entity.contactPage).toBeUndefined();
    expect(signals.entity.contactRoute).toMatchObject({url:'https://form.typeform.com/to/Cis8by',label:'Request a Proposal',sourcePageUrl:'https://agency.example/'});
    const checks = scoreSite(signals).categoryDetails.entityTrust.checks;
    expect(checks.find(check => check.label === 'Public contact route or details observed')).toMatchObject({status:'passed',evidence:'https://form.typeform.com/to/Cis8by'});
    expect(checks.find(check => check.label === 'Public phone or email details')).toMatchObject({status:'unknown'});
  });

  it('does not treat an unrelated external link labeled contact as a verified form route', () => {
    const crawl = makeCrawl([{
      url:'https://agency.example/',
      html:'<html><body><a href="https://unrelated.example/privacy">Contact us</a><main><p>We provide website design and strategy with a detailed process, examples, and clear next steps for local businesses considering a new site.</p></main></body></html>',
    }]);
    expect(extractSiteSignals(crawl).entity.contactRoute).toBeNull();
  });
  it('recognizes a named service landing page without a /services path', () => {
    const crawl = makeCrawl([{
      url: 'https://agency.example/web-design',
      html: '<html><head><title>Second Crew | Web Design</title></head><body><main><h1>Web Design</h1><h2>Our web design process</h2><p>We build websites for businesses and help clients request a proposal.</p></main></body></html>',
    }]);
    expect(extractSiteSignals(crawl).content.servicePages.map((page) => page.url)).toEqual(['https://agency.example/web-design']);
  });

  it('keeps articles and portfolio proof out of the service-page count even when they mention services', () => {
    const crawl = makeCrawl([
      {url:'https://agency.example/blog/web-design-services',html:'<html><head><title>Web Design Services Guide</title></head><body><main><h1>Web Design Services</h1><p>We offer tips for choosing a provider.</p></main></body></html>'},
      {url:'https://agency.example/our-clients/portfolio/reseed',html:'<html><head><title>Service Design for Reseed</title></head><body><main><h1>Service Design</h1><p>Our process helped this client.</p></main></body></html>'},
    ]);
    const signals = extractSiteSignals(crawl);
    expect(signals.content.servicePages).toEqual([]);
    expect(signals.pages.map((page) => page.contentType)).toEqual(['education','case_study']);
  });

  it('preserves product, contact and company page intent across site types', () => {
    const crawl = makeCrawl([
      {url:'https://store.example/products/widget',html:'<html><head><title>Widget</title></head><body><main><h1>Widget</h1><p>Our process makes this product reliable.</p></main></body></html>'},
      {url:'https://store.example/contact',html:'<html><head><title>Contact</title></head><body><main><h1>Contact</h1></main></body></html>'},
      {url:'https://store.example/about-us',html:'<html><head><title>About Us</title></head><body><main><h1>About Us</h1></main></body></html>'},
    ]);
    expect(extractSiteSignals(crawl).pages.map((page) => page.contentType)).toEqual(['product','contact','about']);
  });
});
