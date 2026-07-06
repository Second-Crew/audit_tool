import { describe, expect, it } from 'vitest';
import { compareCompetitors, scoreSite } from '../lib/audit/scoring.js';

function makeSignals(overrides = {}) {
  const base = {
    domain: 'example.com',
    startUrl: 'https://example.com/',
    crawl: { origin: 'https://example.com' },
    pageCount: 20,
    pages: Array.from({ length: 20 }, () => ({ technical: { wordCount: 500 } })),
    sitemap: { found: true, urlCount: 40 },
    robots: {
      found: true,
      botAccess: {
        Googlebot: { allowed: true, evidence: 'Googlebot: allowed at /' },
        'OAI-SearchBot': { allowed: true, evidence: 'OAI-SearchBot: allowed at /' },
        'ChatGPT-User': { allowed: true, evidence: 'ChatGPT-User: allowed at /' },
      },
    },
    llms: { found: true, hasUsefulContent: true, length: 800 },
    schema: {
      found: true,
      count: 12,
      types: ['Organization', 'Service', 'FAQPage', 'BreadcrumbList'],
      hasLocalBusiness: true,
      hasFAQ: true,
      hasProduct: false,
      hasService: true,
      hasArticle: false,
      hasBreadcrumb: true,
      hasReview: false,
      invalidCount: 0,
    },
    content: {
      faqPages: [{ url: 'https://example.com/faq' }],
      servicePages: [{ url: 'https://example.com/s1' }, { url: 'https://example.com/s2' }],
      productPages: [{ url: 'https://example.com/p1' }],
      comparisonPages: [{ url: 'https://example.com/vs' }],
      hasDirectAnswers: true,
      hasProcess: true,
      hasPricing: true,
      hasFreshnessSignals: true,
      topicalDepth: 9,
    },
    entity: {
      aboutPage: { url: 'https://example.com/about' },
      contactPage: { url: 'https://example.com/contact' },
      sameAsLinks: ['https://linkedin.com/company/x', 'https://facebook.com/x'],
      hasCredentials: true,
      hasCaseStudies: true,
      hasAuthorSignals: true,
      trustPages: [{ url: 'https://example.com/case-studies' }],
    },
    commerce: { likelyEcommerce: false, hasProductSchema: false, hasOfferSchema: false, hasReviews: false, hasShippingReturns: false, productPageCount: 0 },
    saas: { likelySaas: false, hasPricingPage: false, hasDocs: false, hasIntegrations: false, hasSecurityTrust: false, hasCaseStudies: false },
    local: { city: '', cityMentioned: false, phones: ['555-123-4567'], emails: [], hasAddress: false, hasHours: false, hasServiceArea: false, locationPageCount: 0 },
    seo: {
      noindexPages: 0,
      titleCoverage: 1,
      descriptionCoverage: 0.9,
      h1Coverage: 0.9,
      duplicateTitleCount: 0,
      duplicateDescriptionCount: 0,
    },
    accessibility: { averageAltRatio: 0.9, formLabelCoverage: 1, pagesWithLandmarks: 18 },
    security: { hasHttps: true, hasHsts: true, hasCsp: false, hasFrameProtection: true, hasNosniff: true, hasReferrerPolicy: false },
  };

  return deepMerge(base, overrides);
}

function deepMerge(target, source) {
  const output = { ...target };
  for (const [key, value] of Object.entries(source)) {
    if (value && typeof value === 'object' && !Array.isArray(value) && typeof target[key] === 'object' && !Array.isArray(target[key])) {
      output[key] = deepMerge(target[key], value);
    } else {
      output[key] = value;
    }
  }
  return output;
}

function makeScoredSite(signalOverrides = {}) {
  const signals = makeSignals(signalOverrides);
  return { signals, scoring: scoreSite(signals) };
}

describe('scoreSite', () => {
  it('returns bounded scores and all category details', () => {
    const { scoring } = makeScoredSite();

    for (const [key, value] of Object.entries(scoring.scores)) {
      if (value == null) continue;
      expect(value, `score ${key}`).toBeGreaterThanOrEqual(0);
      expect(value, `score ${key}`).toBeLessThanOrEqual(100);
    }

    expect(Object.keys(scoring.categoryDetails)).toEqual(expect.arrayContaining([
      'crawlability',
      'structuredData',
      'answerReadiness',
      'entityTrust',
      'technicalSeo',
      'pageExperience',
      'verticalReadiness',
      'security',
      'accessibility',
    ]));
  });

  it('flags a blocked OAI-SearchBot as a high severity finding and lowers crawlability', () => {
    const healthy = makeScoredSite();
    const blocked = makeScoredSite({
      robots: { botAccess: { 'OAI-SearchBot': { allowed: false, evidence: 'OAI-SearchBot: blocked at /' } } },
    });

    const finding = blocked.scoring.findings.find((f) => f.title.includes('ChatGPT Search crawler'));
    expect(finding).toBeDefined();
    expect(finding.severity).toBe('high');
    expect(blocked.scoring.scores.crawlability).toBeLessThan(healthy.scoring.scores.crawlability);
  });

  it('sorts findings with high severity first', () => {
    const { scoring } = makeScoredSite({
      robots: { botAccess: { 'OAI-SearchBot': { allowed: false, evidence: 'blocked' } } },
      llms: { found: false, hasUsefulContent: false, length: 0 },
    });

    const severities = scoring.findings.map((f) => f.severity);
    const weight = { high: 3, medium: 2, low: 1 };
    const sorted = [...severities].sort((a, b) => weight[b] - weight[a]);
    expect(severities).toEqual(sorted);
  });
});

describe('compareCompetitors', () => {
  it('computes score diff, gaps, and advantages for successful crawls', () => {
    const primary = makeScoredSite({ schema: { count: 4 } });
    const competitorSite = makeScoredSite({ schema: { count: 12 }, entity: { trustPages: [] } });
    const competitor = { input: { url: 'https://rival.com', name: 'Rival' }, ...competitorSite };

    const [comparison] = compareCompetitors(primary, [competitor]);

    expect(comparison.name).toBe('Rival');
    expect(comparison.error).toBeUndefined();
    expect(comparison.scoreDiff).toBe(competitorSite.scoring.scores.aeoGeo - primary.scoring.scores.aeoGeo);
    expect(comparison.gaps.some((gap) => gap.startsWith('Schema coverage'))).toBe(true);
    expect(comparison.advantages.some((adv) => adv.startsWith('Trust pages'))).toBe(true);
  });

  it('keeps failed competitor crawls in the comparison with their error', () => {
    const primary = makeScoredSite();
    const failed = {
      input: { url: 'https://broken.example', name: '' },
      signals: { domain: 'https://broken.example', startUrl: 'https://broken.example', pageCount: 0 },
      scoring: { scores: { aeoGeo: 0, overall: 0 }, findings: [], categoryDetails: {} },
      error: 'Could not resolve host "broken.example"',
    };

    const results = compareCompetitors(primary, [failed]);

    expect(results).toHaveLength(1);
    expect(results[0].error).toBe('Could not resolve host "broken.example"');
    expect(results[0].scores).toBeNull();
    expect(results[0].scoreDiff).toBeNull();
    expect(results[0].crawledPages).toBe(0);
  });
});
