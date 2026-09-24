import { GoogleGenAI } from '@google/genai';

const DEFAULT_MODEL = 'gemini-3.5-flash';
const LLM_TIMEOUT_MS = 25000;

export async function generateAuditNarrative(audit) {
  // Free-form output has not passed claim-level validation. Keep the
  // deterministic evidence summary in client reports unless an operator opts
  // into a reviewed pilot for this deployment.
  if (process.env.AUDIT_GENERATED_NARRATIVE_ENABLED !== 'true') {
    return {
      enabled: false,
      status: 'skipped',
      provider: 'gemini',
      model: null,
      reason: 'Generated narrative is disabled until claim-level validation',
      output: null,
    };
  }
  const apiKey = process.env.GEMINI_API_KEY;
  const provider = process.env.AUDIT_LLM_PROVIDER || 'gemini';
  const model = process.env.GEMINI_MODEL || DEFAULT_MODEL;

  if (provider !== 'gemini') {
    return {
      enabled: false,
      status: 'skipped',
      provider,
      model: null,
      reason: `Unsupported AUDIT_LLM_PROVIDER "${provider}"`,
      output: null,
    };
  }

  if (!apiKey) {
    return {
      enabled: false,
      status: 'skipped',
      provider: 'gemini',
      model,
      reason: 'GEMINI_API_KEY is not configured',
      output: null,
    };
  }

  try {
    const genAI = new GoogleGenAI({ apiKey });

    const result = await withTimeout(
      genAI.models.generateContent({
        model,
        contents: buildPrompt(buildEvidenceBundle(audit)),
        config: {
          temperature: 0.25,
          maxOutputTokens: 4000,
          responseMimeType: 'application/json',
          // Narrative rewriting doesn't need extended thinking; keep latency low.
          thinkingConfig: buildThinkingConfig(model),
        },
      }),
      LLM_TIMEOUT_MS
    );
    const text = result.text;
    const output = normalizeNarrative(JSON.parse(extractJson(text)), audit);

    return {
      enabled: true,
      status: 'generated',
      provider: 'gemini',
      model,
      reason: null,
      output,
    };
  } catch (error) {
    console.error('Gemini narrative error:', error);
    return {
      enabled: true,
      status: 'failed',
      provider: 'gemini',
      model,
      reason: error.message,
      output: null,
    };
  }
}

// Gemini 3.x models control reasoning with thinkingLevel (setting both
// thinkingLevel and thinkingBudget is an API error); 2.5-era models only
// support the numeric thinkingBudget.
function buildThinkingConfig(model) {
  const generation = Number.parseInt(model.match(/gemini-(\d+)/)?.[1] ?? '0', 10);
  return generation >= 3 ? { thinkingLevel: 'MINIMAL' } : { thinkingBudget: 0 };
}

function buildEvidenceBundle(audit) {
  const primary = audit.primary;
  const categoryDetails = Object.values(primary.scoring.categoryDetails).map((category) => ({
    name: category.name,
    score: category.score,
    checks: category.checks.map((check) => ({
      label: check.label,
      status: check.status,
      score: check.score,
      maxScore: check.maxScore,
      evidence: check.evidence,
    })).slice(0, 12),
  }));

  return {
    companyName: audit.input.companyName || primary.signals.domain,
    domain: primary.signals.domain,
    startUrl: primary.signals.startUrl,
    crawl: {
      pages: primary.signals.pageCount,
      stoppedBy: primary.signals.crawl.summary.stoppedBy,
      elapsedMs: audit.elapsedMs,
      sitemapUrls: primary.signals.sitemap.urlCount,
      robotsFound: primary.signals.robots.found,
      llmsTxtFound: primary.signals.llms.found,
    },
    scores: primary.scoring.scores,
    categoryDetails,
    findings: primary.scoring.findings.slice(0, 10).map((finding) => ({
      category: finding.category,
      severity: finding.severity,
      title: finding.title,
      description: finding.description,
      evidence: finding.evidence,
      url: finding.url,
      recommendation: finding.recommendation,
      confidence: finding.confidence,
      scoreImpact: finding.scoreImpact,
    })),
    contentSignals: {
      faqPages: primary.signals.content.faqPages.length,
      servicePages: primary.signals.content.servicePages.length,
      productPages: primary.signals.content.productPages.length,
      comparisonPages: primary.signals.content.comparisonPages.length,
      topicalDepth: primary.signals.content.topicalDepth,
    },
    schema: {
      found: primary.signals.schema.found,
      count: primary.signals.schema.count,
      types: primary.signals.schema.types,
    },
    competitors: audit.competitorComparison.map((competitor) => ({
      domain: competitor.domain,
      name: competitor.name,
      scores: competitor.scores,
      scoreDiff: competitor.scoreDiff,
      gaps: competitor.gaps,
      advantages: competitor.advantages,
      crawledPages: competitor.crawledPages,
    })),
  };
}

function buildPrompt(evidence) {
  return `You are a senior GEO/AEO website diagnostician for a paid audit product.

You must only use the evidence in the JSON bundle. Do not invent facts, rankings, competitors, traffic, revenue, backlinks, reviews, or live search visibility. Do not change scores or turn null grades into numbers. Do not predict AI answer inclusion or citations from on-site checks.

Return only valid JSON matching this shape:
{
  "executiveSummary": "2-4 concise sentences for a business owner",
  "llmRecommendation": "plain-English description of observed site evidence and unmeasured visibility",
  "topIssues": [
    {"title":"Issue title from the evidence", "impact":"High|Medium|Low", "description":"business impact grounded in evidence"}
  ],
  "quickWins": [
    {"title":"Action title", "description":"specific implementation guidance grounded in evidence", "timeEstimate":"30-90 minutes|1-3 hours|1-2 days"}
  ],
  "scoreNarrative": [
    {"label":"GEO/AEO|Technical SEO|Entity Trust|Content|Technical", "score": null, "explanation":"why this check is measured or withheld"}
  ],
  "roadmap": [
    {"phase":"Now|Next|Later", "title":"Roadmap step", "actions":["action 1","action 2"]}
  ],
  "caveats": ["short caveat about unavailable data or confidence"]
}

Evidence JSON:
${JSON.stringify(evidence, null, 2)}`;
}

function normalizeNarrative(value, audit) {
  const fallbackFindings = audit.primary.scoring.findings.slice(0, 5);
  const scores = audit.primary.scoring.scores;

  return {
    executiveSummary: stringOrFallback(
      value.executiveSummary,
      `${audit.input.companyName || audit.primary.signals.domain} had sampled on-site evidence reviewed. Overall and GEO/AEO outcomes were not graded without observed search and AI results.`
    ),
    llmRecommendation: stringOrFallback(
      value.llmRecommendation,
      'Review the observed on-site checks and measure a fixed query panel before assessing AI answer visibility.'
    ),
    topIssues: normalizeArray(value.topIssues, fallbackFindings.map((finding) => ({
      title: finding.title,
      impact: titleCaseSeverity(finding.severity),
      description: finding.description,
    }))).slice(0, 5),
    quickWins: normalizeArray(value.quickWins, fallbackFindings.map((finding) => ({
      title: finding.title,
      description: finding.recommendation,
      timeEstimate: finding.severity === 'high' ? '1-3 hours' : '30-90 minutes',
    }))).slice(0, 5),
    scoreNarrative: [
      { label: 'GEO/AEO', score: null, explanation: 'Not graded without query-level answer and citation observations.' },
      { label: 'Technical SEO', score: scores.seo, explanation: 'Sampled on-site checks, not a ranking or traffic score.' },
    ],
    roadmap: normalizeArray(value.roadmap, buildFallbackRoadmap(fallbackFindings)).slice(0, 4),
    caveats: normalizeArray(value.caveats, [
      'This diagnostic records sampled on-site evidence. It does not verify live rankings or AI answer inclusion.',
    ]).slice(0, 5),
  };
}

function buildFallbackRoadmap(findings) {
  return [
    {
      phase: 'Now',
      title: findings[0]?.title || 'Fix highest-impact audit findings',
      actions: findings.slice(0, 2).map((finding) => finding.recommendation),
    },
    {
      phase: 'Next',
      title: 'Strengthen evidence quality',
      actions: findings.slice(2, 4).map((finding) => finding.recommendation),
    },
  ];
}

function extractJson(text) {
  const trimmed = String(text || '').trim();
  if (trimmed.startsWith('{')) return trimmed;
  const match = trimmed.match(/\{[\s\S]*\}/);
  if (!match) throw new Error('Gemini did not return JSON');
  return match[0];
}

function withTimeout(promise, ms) {
  let timeout;
  const timeoutPromise = new Promise((_, reject) => {
    timeout = setTimeout(() => reject(new Error(`Gemini timed out after ${ms}ms`)), ms);
  });

  return Promise.race([promise, timeoutPromise]).finally(() => clearTimeout(timeout));
}

function normalizeArray(value, fallback) {
  return Array.isArray(value) ? value : fallback;
}

function stringOrFallback(value, fallback) {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

function titleCaseSeverity(severity) {
  return severity === 'high' ? 'High' : severity === 'medium' ? 'Medium' : 'Low';
}
