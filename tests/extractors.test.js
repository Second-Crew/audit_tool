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
  it('requires an explicit recent publication or update date', () => {
    const pattern = buildFreshnessPattern(2030);
    expect(pattern.test('Last updated: March 2, 2030')).toBe(true);
    expect(pattern.test('Published in 2029')).toBe(true);
    expect(pattern.test('Copyright 2030')).toBe(false);
    expect(pattern.test('As of 2029, we serve 40 cities')).toBe(false);
    expect(pattern.test('Founded in 2010')).toBe(false);
    expect(pattern.test('12030 units sold in 12019')).toBe(false);
  });

  it('does not infer freshness from undated marketing language', () => {
    const pattern = buildFreshnessPattern(2030);
    expect(pattern.test('Last updated: March')).toBe(false);
    expect(pattern.test('our latest work')).toBe(false);
  });

  it('does not treat a copyright year as an editorial update', () => {
    const year = new Date().getFullYear();
    const crawl = makeCrawl([
      { url: 'https://example.com', html: `<html><head><title>T</title></head><body>© ${year} Example Co</body></html>` },
    ]);

    expect(extractSiteSignals(crawl).content.hasFreshnessSignals).toBe(false);
  });

  it('does not treat stale years alone as freshness', () => {
    const crawl = makeCrawl([
      { url: 'https://example.com', html: '<html><head><title>T</title></head><body>© 2019 Example Co</body></html>' },
    ]);

    expect(extractSiteSignals(crawl).content.hasFreshnessSignals).toBe(false);
  });
});

describe('content evidence calibration', () => {
  it('keeps a sparse FAQ page as a page-level gap when the rest of the store has usable content', () => {
    const longCopy = 'Our chocolate is made in small batches with careful sourcing and detailed ingredient information for every product. ';
    const signals = extractSiteSignals(makeCrawl([
      { url: 'https://example.com/', html: `<html><body><main><h1>Chocolate store</h1><p>${longCopy}</p></main></body></html>` },
      { url: 'https://example.com/product/truffles', html: `<html><body><main><h1>Truffles</h1><p>${longCopy}</p></main></body></html>` },
      { url: 'https://example.com/product/bars', html: `<html><body><main><h1>Bars</h1><p>${longCopy}</p></main></body></html>` },
      { url: 'https://example.com/product/boxes', html: `<html><body><main><h1>Boxes</h1><p>${longCopy}</p></main></body></html>` },
      { url: 'https://example.com/product/gifts', html: `<html><body><main><h1>Gifts</h1><p>${longCopy}</p></main></body></html>` },
      { url: 'https://example.com/faq', html: '<html><body><main><h1>FAQ</h1></main></body></html>' },
    ]));
    expect(signals.contentEvidence).toMatchObject({ status: 'sufficient', sparsePages: 1, criticalSparseUrls: [] });
    expect(signals.content.faqPages).toHaveLength(0);
    expect(scoreSite(signals).scores.seo).not.toBeNull();
  });
  it('does not turn incidental body copy into a comparison page or direct answer', () => {
    const signals = extractSiteSignals(makeCrawl([{
      url: 'https://example.com/services',
      html: '<html><head><title>Website services</title></head><body><main><h1>Website services</h1><p>We are a design agency. Our work includes ecommerce vs corporate examples and the latest projects.</p></main></body></html>',
    }]));
    expect(signals.content.comparisonPages).toEqual([]);
    expect(signals.content.hasDirectAnswers).toBe(false);
    expect(signals.content.hasFreshnessSignals).toBe(false);
  });

  it('recognizes a question with a nearby substantive answer', () => {
    const signals = extractSiteSignals(makeCrawl([{
      url: 'https://example.com/guide',
      html: '<html><body><main><h2>How long does implementation take?</h2><p>Implementation normally takes six to eight weeks after discovery, depending on the number of integrations and the review cycle.</p></main></body></html>',
    }]));
    expect(signals.content.hasDirectAnswers).toBe(true);
    expect(signals.pages[0].directAnswerCount).toBe(1);
    expect(signals.content.faqPages).toHaveLength(0);
  });

  it('does not label product marketing questions as an FAQ page', () => {
    const signals = extractSiteSignals(makeCrawl([{
      url: 'https://example.com/product/gift-box',
      html: '<html><body><main><h1>Gift box</h1><h2>Why gift this box?</h2><p>It contains carefully made chocolates and a handwritten note for the recipient.</p><h2>Who is it for?</h2><p>Choose a gift for your family or friends and add a personal message at checkout.</p></main></body></html>',
    }]));
    expect(signals.content.faqPages).toHaveLength(0);
  });

  it('recognizes a substantive FAQ answer on a dedicated page', () => {
    const signals = extractSiteSignals(makeCrawl([{
      url: 'https://example.com/faq',
      html: '<html><body><main><h1>Frequently asked questions</h1><h2>When will my order ship?</h2><p>Orders placed before noon on a weekday usually ship the next working day, and a tracking link is emailed after dispatch.</p></main></body></html>',
    }]));
    expect(signals.content.faqPages).toHaveLength(1);
  });

  it('requires visible rating evidence on a product page', () => {
    const withoutRating = extractSiteSignals(makeCrawl([{
      url: 'https://example.com/products/widget',
      html: '<html><body><main><h1>Widget</h1><p>Read customer reviews below.</p></main></body></html>',
    }]), { siteType: 'ecommerce' });
    const withRating = extractSiteSignals(makeCrawl([{
      url: 'https://example.com/products/widget',
      html: '<html><body><main><h1>Widget</h1><p>Rated 4.8 out of 5 by buyers.</p></main></body></html>',
    }]), { siteType: 'ecommerce' });
    expect(withoutRating.commerce.hasReviews).toBe(false);
    expect(withRating.commerce.hasReviews).toBe(true);
  });

  it('does not classify legal pages or product-team articles as purchasable products', () => {
    const signals = extractSiteSignals(makeCrawl([
      { url: 'https://example.com/terms-of-service', html: '<html><head><title>Terms of Service</title></head><body><main><h1>Terms of Service</h1><p>Our terms.</p></main></body></html>' },
      { url: 'https://example.com/director-of-product-development', html: '<html><head><title>Director of Product Development</title></head><body><main><h1>Director of Product Development</h1><p>Meet the team.</p></main></body></html>' },
    ]), { websiteType: 'ecommerce', ecommerceFunctionality: 'yes' });
    expect(signals.pages.map((page) => page.contentType)).toEqual(['legal', 'general']);
    expect(signals.commerce.productPageCount).toBe(0);
  });

  it('does not classify an article saying talk about as a company About page', () => {
    const signals = extractSiteSignals(makeCrawl([{
      url: 'https://example.com/newsletters/we-need-to-talk-about-chocolate',
      html: '<html><head><title>We need to talk about chocolate</title></head><body><main><h1>We need to talk about chocolate</h1><p>Chocolate is delicious.</p></main></body></html>',
    }]));
    expect(signals.pages[0].contentType).not.toBe('about');
  });

  it('keeps a storefront homepage with featured products out of product-page checks', () => {
    const signals = extractSiteSignals(makeCrawl([{
      url: 'https://example.com/',
      html: '<html><body><main><h1>Store</h1><p>Featured item: $20. Add to cart.</p></main></body></html>',
    }]), { websiteType: 'ecommerce', ecommerceFunctionality: 'yes' });
    expect(signals.pages[0].contentType).toBe('general');
    expect(signals.commerce.productPageCount).toBe(0);
  });

  it('does not use sitewide Product schema as evidence for sampled product pages', () => {
    const signals = extractSiteSignals(makeCrawl([
      pageWithJsonLd('https://example.com/', [{ '@type': 'Product', name: 'Featured item' }]),
      { url: 'https://example.com/products/widget', html: '<html><body><main><h1>Widget</h1><p>Product details.</p></main></body></html>' },
    ]), { websiteType: 'ecommerce', ecommerceFunctionality: 'yes' });
    expect(signals.commerce.productPageCount).toBe(1);
    expect(signals.commerce.hasProductSchema).toBe(false);
  });

  it('requires both shipping and returns evidence for the combined commerce check', () => {
    const signals = extractSiteSignals(makeCrawl([{
      url: 'https://example.com/products/widget',
      html: '<html><body><main><h1>Widget</h1><p>Free shipping on every order.</p></main></body></html>',
    }]), { websiteType: 'ecommerce', ecommerceFunctionality: 'yes' });
    expect(signals.commerce.hasShippingReturns).toBe(false);
  });

  it('does not count a privacy page as third-party proof', () => {
    const signals = extractSiteSignals(makeCrawl([{
      url: 'https://example.com/privacy',
      html: '<html><head><title>Privacy Policy</title></head><body><main><h1>Privacy Policy</h1><p>How we handle data.</p></main></body></html>',
    }]));
    expect(signals.entity.trustPages).toEqual([]);
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
