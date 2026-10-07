import { describe, it, expect } from 'vitest';
import * as cheerio from 'cheerio';
import { extractSiteSignals } from '../lib/audit/extractors.js';
import { scoreAiTechnicalReadiness } from '../lib/audit/readiness.js';
import { assessSupportingFeatures } from '../lib/audit/supporting-features.js';
import { indexingDirectives } from '../lib/audit/evidence.js';

const text = 'We provide practical website design services and support for local companies. Our experienced team builds accessible public websites with clear business information.';
function signals({ html = `<main><h1>Example</h1><p>${text}</p></main>`, status = 200, robotsStatus = 200, robots = 'User-agent: *\nAllow: /', errors = [], page = {}, llms = {}, input = {} } = {}) {
  return extractSiteSignals({ domain: 'example.com', origin: 'https://example.com', startUrl: 'https://example.com/',
    pages: [{ url: 'https://example.com/', requestedUrl: 'https://example.com/', html, status, headers: { 'content-type': 'text/html' }, observedAt: '2026-10-06T00:00:00Z', ...page }],
    errors, blockedByRobots: [], summary: { crawledPages: 1 }, auxiliary: {
      robots: { status: robotsStatus, body: robots, found: robotsStatus === 200 },
      llms: { status: 404, body: '', found: false, url: 'https://example.com/llms.txt', ...llms }, sitemap: { found: false, urls: [] },
    } }, input);
}
const score = options => scoreAiTechnicalReadiness(signals(options));
const check = (result, id) => result.checks.find(c => c.id === id);

describe('versioned equal-weight technical checklist', () => {
  it('scores a complete sample without optional-feature points or outcome claims', () => {
    const result = score();
    expect(result).toMatchObject({ score: 100, status: 'Assessed', counts: { passed: 6, failed: 0, unknown: 0 }, coverage: 1 });
    const withFeatures = score({ html: `<script type="application/ld+json">{"@type":"Organization","name":"Example"}</script><main><h1>Example</h1><p>${text}</p><h2>How does it work?</h2><p>${text}</p></main>` });
    expect(withFeatures.score).toBe(result.score);
    expect(result.definition).toContain('not citations');
  });
  it('preserves zero and exposes crawler/directive blockers even within larger samples', () => {
    const s = signals();
    s.pages[0].status = 404;
    s.pages[0].indexing.indexAllowed = false;
    s.pages[0].indexing.snippetAllowed = false;
    s.robots.botAccess.Googlebot.pages[0].allowed = false;
    s.robots.botAccess['OAI-SearchBot'].pages[0].allowed = false;
    // Main text cannot be assessed from an unsuccessful retrieval.
    const partial = scoreAiTechnicalReadiness(s);
    expect(partial).toMatchObject({ score: 0, status: 'Provisional', counts: { passed: 0, failed: 5, unknown: 1 }, possibleRange: { min: 0, max: 17 } });
    expect(partial.blockers).toHaveLength(4);
    const sparse = score({ html: '<main>Short.</main>', robots: 'User-agent: *\nDisallow: /', page: { headers: { 'x-robots-tag': 'noindex,nosnippet' } } });
    expect(sparse).toMatchObject({ score: 17, coverage: 1, counts: { failed: 5, passed: 1 } });
  });
  it('keeps missing robots and rendering evidence unknown with a missing-evidence range', () => {
    const result = score({ robotsStatus: 503, html: '<script src="/app.js"></script><main>Loading</main>' });
    expect(result).toMatchObject({ score: 100, status: 'Provisional', counts: { passed: 3, failed: 0, unknown: 3 }, possibleRange: { min: 50, max: 100 }, coverage: 0.5 });
    expect(check(result, 'mainText').status).toBe('unknown');
  });
  it('keeps transport failures, HTTP failures and skipped audit-bot paths in coverage', () => {
    const s = signals({ errors: [{ url: 'https://example.com/failed', status: 503 }, { url: 'https://example.com/timeout', status: 0 }] });
    const result = scoreAiTechnicalReadiness(s);
    expect(result.samplePages).toBe(3);
    expect(result.applicable).toBe(18);
    expect(result.counts).toEqual({ passed: 10, failed: 1, unknown: 7, notApplicable: 0 });
    expect(result.possibleRange).toEqual({ min: 56, max: 94 });
  });
  it('returns could-not-assess and a concrete reason for no evidence', () => {
    expect(scoreAiTechnicalReadiness({})).toMatchObject({ score: null, status: 'Could not assess', coverage: 0 });
    const s = { pages: [], sampleFailures: [{ url: 'https://example.com/', status: 0 }], robots: {} };
    expect(scoreAiTechnicalReadiness(s)).toMatchObject({ score: null, status: 'Could not assess', counts: { unknown: 6 }, possibleRange: { min: 0, max: 100 } });
  });
  it('retains fetched/rendered provenance and does not erase fetched noindex', () => {
    const result = score({ page: { rendered: true, fetchedHtml: '<meta name="robots" content="noindex"><main>Loading</main>' } });
    expect(check(result, 'indexing').status).toBe('failed');
    expect(check(result, 'mainText').evidenceSource).toBe('rendered_dom');
    expect(check(result, 'mainText').evidence).toContain('fetched HTML 7 characters');
    expect(result.definition).toContain('does not prove provider rendering');
  });
  it('marks absence of restrictions unknown when HTML is truncated', () => {
    expect(score({ page: { truncated: true } })).toMatchObject({ counts: { passed: 3, unknown: 3 }, status: 'Provisional' });
  });
  it('checks both requested and redirect destination paths', () => {
    const result = score({ robots: 'User-agent: OAI-SearchBot\nDisallow: /private', page: { url: 'https://example.com/private' } });
    expect(check(result, 'oaiSearchBot').status).toBe('failed');
    expect(check(result, 'html').finalUrl).toBe('https://example.com/private');
  });
});

describe('indexing and snippet directive semantics', () => {
  it('combines duplicate scoped rules, whitespace and most-restrictive snippet limits', () => {
    const d = indexingDirectives(cheerio.load('<meta name="robots" content="max-snippet: -1"><meta name="Googlebot" content="max-snippet: 0">'), { 'X-Robots-Tag': 'bingbot: nosnippet, googlebot: index' });
    expect(d).toMatchObject({ indexAllowed: true, snippetAllowed: false, maxSnippet: 0 });
    expect(indexingDirectives(cheerio.load('<meta name="bingbot" content="nosnippet">'), { 'x-robots-tag': 'bingbot: noindex, nosnippet' })).toMatchObject({ indexAllowed: true, snippetAllowed: true });
    expect(indexingDirectives(cheerio.load(''), { 'x-robots-tag': ['bingbot: noindex', 'nosnippet'] })).toMatchObject({ indexAllowed: true, snippetAllowed: false });
  });
  it('none prohibits indexing, but does not mean nosnippet; nofollow does not block indexing', () => {
    expect(indexingDirectives(cheerio.load('<meta name="robots" content="none">'))).toMatchObject({ indexAllowed: false, snippetAllowed: true });
    expect(indexingDirectives(cheerio.load('<meta name="robots" content="nofollow,max-image-preview:none,max-snippet:25">'))).toMatchObject({ indexAllowed: true, snippetAllowed: true, maxSnippet: 25 });
  });
  it('preserves partial exclusions and fails only complete text exclusion', () => {
    const partial = score({ html: `<main><div data-nosnippet>Private price</div><p>${text}</p></main>` });
    expect(check(partial, 'snippets').status).toBe('passed');
    expect(check(partial, 'snippets').evidence).toContain('1 partial data-nosnippet exclusions');
    expect(check(score({ html: `<main><div data-nosnippet>${text}</div></main>` }), 'snippets').status).toBe('failed');
  });
  it('checks expiry against recorded observation time', () => {
    const result = score({ page: { headers: { 'x-robots-tag': 'unavailable_after: Wed, 03 Dec 2025 13:00:00 GMT' } } });
    expect(check(result, 'indexing').status).toBe('failed');
  });
});

describe('descriptive supporting features', () => {
  it('distinguishes answers from FAQ-page purpose and ignores hidden/empty answers', () => {
    const s = signals({ html: `<main><h1>Product</h1><h2>Want to grow?</h2><p>${text}</p><h2>Empty question?</h2><p></p><h2 hidden>Hidden?</h2><p hidden>${text}</p></main>` });
    expect(s.content.faqPages).toHaveLength(0);
    const faq = assessSupportingFeatures(s)[0];
    expect(faq).toMatchObject({ presence: 'Observed', status: 'Needs human review' });
    expect(faq.evidence).toHaveLength(1);
    const actual = signals({ html: `<main><h1>FAQs</h1><details><summary>How do you help?</summary><p>${text}</p></details></main>` });
    expect(actual.content.faqPages).toHaveLength(1);
    expect(assessSupportingFeatures(actual)[0].status).toBe('Needs human review');
  });
  it('reports invalid and mismatched JSON-LD plus unsupported Microdata/RDFa validation', () => {
    const s = signals({ html: `<script type="application/ld+json">SECRET_BAD_JSON</script><script type="application/ld+json">{"@type":"Service","name":"Wrong entity","url":"not-a-url"}</script><main itemscope itemtype="https://schema.org/Service" typeof="Service"><p>${text}</p></main>` });
    const schema = assessSupportingFeatures(s)[1];
    expect(schema.status).toBe('Needs improvement');
    expect(schema.issues.join(' ')).toContain('Invalid JSON-LD');
    expect(schema.issues.join(' ')).toContain('Entity name');
    expect(schema.issues.join(' ')).toContain('Invalid entity URL');
    expect(schema.evidence.map(e => e.facts).join(' ')).toContain('Detected only');
    expect(JSON.stringify(schema)).not.toContain('SECRET_BAD_JSON');
  });
  it('does not call unextracted rendered entity text a schema inconsistency', () => {
    const s=signals({html:'<script type="application/ld+json">{"@type":"Organization","name":"Example"}</script><script src="/app.js"></script><main>Loading</main>'});
    const schema=assessSupportingFeatures(s)[1];
    expect(schema.status).toBe('Needs human review');
    expect(schema.issues).toEqual([]);
    expect(schema.evidence[0].facts).toContain('could not be verified from incomplete text');
  });
  it('checks llms structure and existing sampled links without making consumption claims', () => {
    const s = signals({ input: { companyName: 'Example' }, errors: [{ url: 'https://example.com/broken', status: 404 }], llms: { found: true, status: 200, body: '# Example\n\n> We build websites for businesses.\n\n## Services\n- [Home](https://example.com/)\n- [Broken](https://example.com/broken)\n- [Other](https://example.com/unsampled)' } });
    const f = assessSupportingFeatures(s)[2];
    expect(f.status).toBe('Needs improvement');
    expect(s.llms.links.map(l => l.status)).toEqual(['retrieved', 'failed', 'not_sampled']);
    expect(f.rationale).toContain('does not prove ChatGPT');
    expect(assessSupportingFeatures(signals({ llms: { status: 503 } }))[2].status).toBe('Could not verify');
    expect(assessSupportingFeatures(signals())[2].status).toBe('Not observed');
  });
  it('identifies chat providers only from resource evidence and keeps AI accuracy unverified', () => {
    const s = signals({ html: `<script src="https://client.crisp.chat/l.js?token=PRIVATE_TOKEN"></script><main><p>${text}</p><button aria-label="Chat with us">Chat</button><a href="/contact">Contact</a></main>` });
    const f = assessSupportingFeatures(s)[3];
    expect(f).toMatchObject({ presence: 'Visible control observed', status: 'Needs human review' });
    expect(f.evidence[0].facts).toContain('Crisp');
    expect(JSON.stringify(f)).not.toContain('PRIVATE_TOKEN');
    expect(f.rationale).toContain('does not establish AI capability');
    const spoof = signals({ html: `<script src="https://evil.example/crisp.chat"></script><main><p>${text}</p></main>` });
    expect(assessSupportingFeatures(spoof)[3].presence).toBe('Not observed');
  });
  it('leaves all four optional features visible on stores and agencies without score penalties', () => {
    for (const websiteType of ['ecommerce', 'marketing']) {
      const s = signals({ input: { websiteType } });
      expect(assessSupportingFeatures(s)).toHaveLength(4);
      expect(scoreAiTechnicalReadiness(s).score).toBe(100);
    }
  });
});

it('keeps a question-shaped CTA out of missing-answer defects while detecting nested FAQ answers', () => {
  const s=signals({html:`<main><h1>Product</h1><section class="faq"><h2>Frequently asked questions</h2><div><div><h3>How does it work?</h3></div><div><p>${text}</p></div></div><div><h3>What is missing?</h3><p></p></div></section><section><h2>Ready for fast inference?</h2><a href="/contact">Get Started</a></section></main>`});
  const faq=assessSupportingFeatures(s)[0];
  expect(faq.evidence).toHaveLength(2);
  expect(faq.evidence.some(e=>e.substantive && e.facts.includes(text))).toBe(true);
  expect(faq.evidence.some(e=>e.facts.includes('Ready for'))).toBe(false);
  expect(faq.status).toBe('Needs improvement');
  expect(faq.issues).toHaveLength(1);
});
it('requires human review for a visible-name mismatch alone rather than claiming a schema defect', () => {
  const s=signals({html:`<script type="application/ld+json">{"@type":"Organization","name":"Logo-only organization"}</script><main><p>${text}</p></main>`});
  expect(assessSupportingFeatures(s)[1]).toMatchObject({status:'Needs human review',presence:'Observed'});
  expect(assessSupportingFeatures(s)[1].issues.join(' ')).toContain('verify visible consistency');
});
