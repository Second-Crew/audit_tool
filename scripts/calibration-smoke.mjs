import { crawlSite } from '../lib/audit/crawler.js';
import { extractSiteSignals } from '../lib/audit/extractors.js';
import { fetchText } from '../lib/audit/fetcher.js';
import { isAllowedByRobots } from '../lib/audit/robots.js';
import { scoreSite } from '../lib/audit/scoring.js';
import { canonicalizeUrl } from '../lib/audit/url.js';

// Public, platform- or agency-verified examples. This is a diagnostic sample,
// not a claim that these sites rank highest or that their current SEO is good.
const samples = {
  baunfire: { url: 'https://www.baunfire.com/', siteType: 'marketing', city: 'San Jose', group: 'agency' },
  clay: { url: 'https://clay.global/', siteType: 'marketing', city: 'San Francisco', group: 'agency' },
  ramotion: { url: 'https://www.ramotion.com/', siteType: 'marketing', city: 'San Francisco', group: 'agency' },
  solutionarian: { url: 'https://solutionarianmarketing.com/', siteType: 'marketing', city: 'San Jose', group: 'agency' },
  hiut: { url: 'https://hiutdenim.co.uk/', siteType: 'ecommerce', group: 'shopify' },
  verve: { url: 'https://www.vervecoffee.com/', siteType: 'ecommerce', group: 'shopify', focusUrls: ['https://www.vervecoffee.com/products/rise-and-run-blend'] },
  allbirds: { url: 'https://www.allbirds.com/', siteType: 'ecommerce', group: 'shopify', focusUrls: ['https://www.allbirds.com/products/mens-tree-runners-wheat-dark-beige'] },
  gruum: { url: 'https://www.gruum.com/', siteType: 'ecommerce', group: 'woocommerce' },
  landyachtz: { url: 'https://landyachtz.com/', siteType: 'ecommerce', group: 'woocommerce', focusUrls: ['https://landyachtz.com/shop/all/skate/boards/cruisers/dinghy-classic-ghosted/'] },
  melt: { url: 'https://meltchocolates.com/', siteType: 'ecommerce', group: 'woocommerce', focusUrls: ['https://meltchocolates.com/product/sea-salt-dark-chocolate-bar/'] },
  nopong: { url: 'https://www.nopong.com.au/', siteType: 'ecommerce', group: 'woocommerce' },
};

const selected = process.argv.slice(2);
if (!selected.length || selected.some((id) => !samples[id])) {
  console.error(`Usage: node scripts/calibration-smoke.mjs ${Object.keys(samples).join(' ')}`);
  process.exit(2);
}

for (const id of selected) {
  const sample = samples[id];
  try {
    const crawl = await crawlSite(sample.url, {
      maxPages: 8,
      maxDurationMs: 45000,
      requestTimeoutMs: 8000,
      concurrency: 2,
      requestDelayMs: 250,
    });
    if (!crawl.pages.length) throw new Error(`No pages: ${JSON.stringify(crawl.errors.slice(0, 2))}`);
    const focusResults = [];
    for (const focusUrl of sample.focusUrls || []) {
      if (crawl.pages.some((page) => canonicalizeUrl(page.url) === canonicalizeUrl(focusUrl))) continue;
      const parsed = new URL(focusUrl);
      if (!isAllowedByRobots(crawl.auxiliary.robots.parsed, 'SecondCrewAuditBot', parsed.pathname + parsed.search, crawl.origin)) {
        focusResults.push({ url: focusUrl, status: 'robots_blocked' });
        continue;
      }
      const response = await fetchText(focusUrl, { timeoutMs: 8000, maxBytes: 900_000 });
      focusResults.push({ url: focusUrl, status: response.status, error: response.error || null });
      if (response.ok && /html|xhtml/i.test(response.headers['content-type'] || '')) crawl.pages.push({
        url: canonicalizeUrl(response.url), requestedUrl: focusUrl, status: response.status,
        headers: response.headers, html: response.body, truncated: response.truncated,
        observedAt: new Date().toISOString(), discoveredLinks: [], sampleSource: 'manual_focus',
      });
    }
    const signals = extractSiteSignals(crawl, { url: sample.url, websiteType: sample.siteType, ecommerceFunctionality: sample.siteType === 'ecommerce' ? 'yes' : 'no', city: sample.city });
    const scoring = scoreSite(signals);
    console.log(JSON.stringify({
      id,
      group: sample.group,
      url: sample.url,
      observedAt: new Date().toISOString(),
      crawl: crawl.summary,
      focusResults,
      contentEvidence: signals.contentEvidence,
      siteType: { value: signals.siteType.value, ecommerceStatus: signals.siteType.ecommerce.status },
      pageTypes: signals.pages.map((page) => ({ url: page.url, type: page.contentType, wordCount: page.technical.wordCount })),
      signals: {
        comparisonPages: signals.content.comparisonPages.map((page) => page.url),
        directAnswerPages: signals.pages.filter((page) => page.directAnswerCount > 0).map((page) => page.url),
        freshness: signals.content.hasFreshnessSignals,
        trustPages: signals.entity.trustPages.map((page) => page.url),
        hasReviews: signals.commerce.hasReviews,
        hasShippingReturns: signals.commerce.hasShippingReturns,
        schemaTypes: signals.schema.types,
      },
      scores: scoring.scores,
      failedChecks: Object.fromEntries(Object.entries(scoring.categoryDetails).map(([category, data]) => [category, data.checks.filter((check) => check.status === 'failed').map((check) => check.label)])),
    }));
  } catch (error) {
    console.log(JSON.stringify({ id, group: sample.group, url: sample.url, observedAt: new Date().toISOString(), error: error.message }));
  }
}
