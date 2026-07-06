import { crawlSite } from './crawler.js';
import { extractSiteSignals } from './extractors.js';
import { getPageSpeedBundle } from './pagespeed.js';
import { compareCompetitors, scoreSite } from './scoring.js';
import { buildCompatibilityResponse } from './compat.js';
import { generateEvidenceReport } from './report.js';
import { normalizeAuditUrl } from './url.js';
import { generateAuditNarrative } from './llm.js';

const DEFAULT_AUDIT_LIMITS = {
  maxPages: 250,
  maxDurationMs: 150000,
  maxCompetitors: 5,
  maxCompetitorPages: 25,
};

export async function runAudit(input, onProgress = null) {
  const normalizedInput = normalizeInput(input);
  const startedAt = Date.now();
  const emit = (event) => {
    try {
      onProgress?.(event);
    } catch {
      // Progress reporting must never break the audit.
    }
  };

  emit({ stage: 'start', maxPages: normalizedInput.limits.maxPages, competitors: normalizedInput.competitors.length });

  const competitorsPromise = auditCompetitors(normalizedInput, emit);
  const [primaryCrawl, pageSpeed, competitors] = await Promise.all([
    crawlSite(
      normalizedInput.url,
      {
        maxPages: normalizedInput.limits.maxPages,
        maxDurationMs: Math.min(normalizedInput.limits.maxDurationMs, 150000),
      },
      (progress) => emit({ stage: 'crawl', ...progress })
    ).then((result) => {
      emit({ stage: 'crawl_done', crawled: result.pages.length });
      return result;
    }),
    getPageSpeedBundle(normalizedInput.url).then((result) => {
      emit({ stage: 'pagespeed_done', available: result.available });
      return result;
    }),
    competitorsPromise,
  ]);

  emit({ stage: 'scoring' });
  const primarySignals = extractSiteSignals(primaryCrawl, normalizedInput);
  const primaryScoring = scoreSite(primarySignals, pageSpeed);
  const primary = {
    signals: primarySignals,
    scoring: primaryScoring,
  };

  const competitorComparison = compareCompetitors(primary, competitors);

  const audit = {
    version: '2.0.0-api-light',
    createdAt: new Date().toISOString(),
    elapsedMs: Date.now() - startedAt,
    input: normalizedInput,
    pageSpeed,
    primary,
    competitors,
    competitorComparison,
  };

  emit({ stage: 'llm' });
  audit.llmInsights = await generateAuditNarrative(audit);
  audit.elapsedMs = Date.now() - startedAt;

  emit({ stage: 'report' });
  const compatibility = buildCompatibilityResponse(audit);
  compatibility.html = generateEvidenceReport(audit, compatibility);

  return {
    audit,
    compatibility,
  };
}

function normalizeInput(input = {}) {
  const url = normalizeAuditUrl(input.url || input.domain);
  const competitorInputs = normalizeCompetitors(input.competitors || input.competitorUrls || []);

  return {
    url,
    companyName: input.companyName || '',
    industry: input.industry || '',
    city: input.city || '',
    competitors: competitorInputs.slice(0, DEFAULT_AUDIT_LIMITS.maxCompetitors),
    limits: {
      maxPages: Number.isFinite(input.maxPages) ? Math.min(Math.max(input.maxPages, 1), 250) : DEFAULT_AUDIT_LIMITS.maxPages,
      maxDurationMs: Number.isFinite(input.maxDurationMs) ? Math.min(Math.max(input.maxDurationMs, 60000), 300000) : DEFAULT_AUDIT_LIMITS.maxDurationMs,
      maxCompetitorPages: Number.isFinite(input.maxCompetitorPages)
        ? Math.min(Math.max(input.maxCompetitorPages, 1), 75)
        : DEFAULT_AUDIT_LIMITS.maxCompetitorPages,
    },
  };
}

function normalizeCompetitors(value) {
  if (typeof value === 'string') {
    return value
      .split(/\r?\n|,/)
      .map((url) => url.trim())
      .filter(Boolean)
      .map((url) => ({ url }));
  }

  if (!Array.isArray(value)) return [];

  return value
    .map((competitor) => {
      if (typeof competitor === 'string') return { url: competitor };
      return { url: competitor.url || competitor.domain, name: competitor.name || '' };
    })
    .filter((competitor) => competitor.url);
}

async function auditCompetitors(input, emit = () => {}) {
  const results = [];

  for (const competitor of input.competitors) {
    emit({ stage: 'competitor', url: competitor.url, index: results.length + 1, total: input.competitors.length });
    try {
      const crawl = await crawlSite(competitor.url, {
        maxPages: input.limits.maxCompetitorPages,
        maxDurationMs: 60000,
        concurrency: 4,
      });
      if (!crawl.pages.length) {
        // Fetch failures (DNS, timeouts, robots blocks) do not throw per URL,
        // so a page-less crawl is reported as a failed competitor instead of
        // a meaningless zero-score comparison.
        const reason = crawl.errors[0]?.error
          ? `Crawl failed: ${crawl.errors[0].error}`
          : crawl.blockedByRobots.length
            ? 'The site\'s robots.txt disallows crawling'
            : 'No pages could be crawled';
        throw new Error(reason);
      }
      const signals = extractSiteSignals(crawl, {
        companyName: competitor.name || '',
        industry: input.industry,
        city: input.city,
      });
      const scoring = scoreSite(signals, { scores: {}, metrics: {}, available: false });
      results.push({
        input: competitor,
        signals,
        scoring,
      });
    } catch (error) {
      results.push({
        input: competitor,
        signals: {
          domain: competitor.url,
          startUrl: competitor.url,
          pageCount: 0,
        },
        scoring: {
          scores: { aeoGeo: 0, overall: 0 },
          findings: [],
          categoryDetails: {},
        },
        error: error.message,
      });
    }
  }

  return results;
}
