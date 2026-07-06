import { NextResponse } from 'next/server';
import { runAudit } from '../../../lib/audit/index.js';
import { persistAudit } from '../../../lib/audit/persistence.js';

export const runtime = 'nodejs';
// Requires a host that allows long-running functions (Vercel Pro or a server deploy).
export const maxDuration = 300;

const RATE_LIMIT = { windowMs: 10 * 60 * 1000, maxRequests: 5 };
const MAX_CONCURRENT_AUDITS = 2;

// Per-instance state: enough to stop accidental hammering from a single client,
// not a substitute for edge/WAF rate limiting on a public deployment.
const requestLog = new Map();
let runningAudits = 0;

export async function POST(request) {
  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Request body must be valid JSON' }, { status: 400 });
  }

  const validationError = validateBody(body);
  if (validationError) {
    return NextResponse.json({ error: validationError }, { status: 400 });
  }

  const clientKey = getClientKey(request);
  if (isRateLimited(clientKey)) {
    return NextResponse.json(
      { error: 'Too many audits from this address. Try again in a few minutes.' },
      { status: 429 }
    );
  }

  if (runningAudits >= MAX_CONCURRENT_AUDITS) {
    return NextResponse.json(
      { error: 'The audit service is busy. Try again in a couple of minutes.' },
      { status: 503 }
    );
  }

  runningAudits += 1;
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (payload) => {
        try {
          controller.enqueue(encoder.encode(`${JSON.stringify(payload)}\n`));
        } catch {
          // Client disconnected; keep the audit running so persistence still happens.
        }
      };

      try {
        const { audit, compatibility } = await runAudit(
          {
            url: body.url || body.domain,
            companyName: body.companyName || '',
            industry: body.industry || '',
            city: body.city || '',
            competitors: body.competitors || body.competitorUrls || [],
            maxPages: body.maxPages || 250,
            maxDurationMs: body.maxDurationMs || 150000,
            maxCompetitorPages: body.maxCompetitorPages || 25,
          },
          (event) => send({ type: 'progress', ...event })
        );

        send({ type: 'progress', stage: 'persist' });
        const persistence = await persistAudit(audit, compatibility);

        send({
          type: 'result',
          data: {
            ...compatibility,
            audit: summarizeAuditForResponse(audit),
            persistence,
          },
        });
      } catch (error) {
        console.error('Analysis error:', error);
        send({ type: 'error', error: error.message || 'Failed to analyze website' });
      } finally {
        runningAudits -= 1;
        try {
          controller.close();
        } catch {
          // Already closed.
        }
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'application/x-ndjson; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      'X-Accel-Buffering': 'no',
    },
  });
}

function validateBody(body) {
  if (!body || typeof body !== 'object') return 'A JSON body is required';

  const url = body.url || body.domain;
  if (!url || typeof url !== 'string') return 'A website URL or domain is required';
  if (url.length > 2048) return 'The website URL is too long';

  for (const field of ['companyName', 'industry', 'city']) {
    if (body[field] != null && (typeof body[field] !== 'string' || body[field].length > 200)) {
      return `"${field}" must be a string of at most 200 characters`;
    }
  }

  const competitors = body.competitors || body.competitorUrls;
  if (competitors != null && typeof competitors !== 'string' && !Array.isArray(competitors)) {
    return 'Competitors must be a string or an array of URLs';
  }
  if (typeof competitors === 'string' && competitors.length > 5000) {
    return 'The competitor list is too long';
  }
  if (Array.isArray(competitors) && competitors.length > 20) {
    return 'Provide at most 20 competitor URLs';
  }

  for (const field of ['maxPages', 'maxDurationMs', 'maxCompetitorPages']) {
    if (body[field] != null && !Number.isFinite(body[field])) {
      return `"${field}" must be a number`;
    }
  }

  return null;
}

function getClientKey(request) {
  const forwarded = request.headers.get('x-forwarded-for');
  return (forwarded ? forwarded.split(',')[0].trim() : '') || request.headers.get('x-real-ip') || 'local';
}

function isRateLimited(clientKey) {
  const now = Date.now();
  const windowStart = now - RATE_LIMIT.windowMs;
  const timestamps = (requestLog.get(clientKey) || []).filter((time) => time > windowStart);

  if (timestamps.length >= RATE_LIMIT.maxRequests) {
    requestLog.set(clientKey, timestamps);
    return true;
  }

  timestamps.push(now);
  requestLog.set(clientKey, timestamps);

  // Keep the log from growing unbounded on long-lived servers.
  if (requestLog.size > 1000) {
    for (const [key, values] of requestLog) {
      if (!values.some((time) => time > windowStart)) requestLog.delete(key);
    }
  }

  return false;
}

function summarizeAuditForResponse(audit) {
  return {
    version: audit.version,
    createdAt: audit.createdAt,
    elapsedMs: audit.elapsedMs,
    input: audit.input,
    primary: {
      domain: audit.primary.signals.domain,
      startUrl: audit.primary.signals.startUrl,
      pageCount: audit.primary.signals.pageCount,
      pages: audit.primary.signals.pages.slice(0, 250).map(summarizePageForResponse),
      crawl: audit.primary.signals.crawl,
      schema: {
        found: audit.primary.signals.schema.found,
        count: audit.primary.signals.schema.count,
        types: audit.primary.signals.schema.types,
        invalidCount: audit.primary.signals.schema.invalidCount,
      },
      content: {
        faqPages: audit.primary.signals.content.faqPages.map((page) => page.url),
        servicePages: audit.primary.signals.content.servicePages.map((page) => page.url),
        productPages: audit.primary.signals.content.productPages.map((page) => page.url),
        locationPages: audit.primary.signals.content.locationPages.map((page) => page.url),
        comparisonPages: audit.primary.signals.content.comparisonPages.map((page) => page.url),
        topicalDepth: audit.primary.signals.content.topicalDepth,
      },
      scores: audit.primary.scoring.scores,
      findings: audit.primary.scoring.findings,
      categoryDetails: audit.primary.scoring.categoryDetails,
    },
    competitorComparison: audit.competitorComparison,
    llm: {
      enabled: audit.llmInsights?.enabled || false,
      status: audit.llmInsights?.status || 'skipped',
      provider: audit.llmInsights?.provider || null,
      model: audit.llmInsights?.model || null,
      reason: audit.llmInsights?.reason || null,
    },
    pageSpeed: {
      available: audit.pageSpeed.available,
      scores: audit.pageSpeed.scores,
      metrics: audit.pageSpeed.metrics,
    },
  };
}

function summarizePageForResponse(page) {
  return {
    url: page.url,
    status: page.status,
    title: page.title,
    metaDescription: page.metaDescription,
    canonical: page.canonical,
    contentType: page.contentType,
    indexable: page.indexable,
    robotsMeta: page.robotsMeta,
    h1: page.headings?.h1?.[0] || '',
    h1Count: page.headings?.h1?.length || 0,
    wordCount: page.technical?.wordCount || 0,
    hasVisibleFaq: page.hasVisibleFaq,
    schemaCount: page.schema?.count || 0,
    schemaTypes: page.schema?.nodes?.flatMap((node) => normalizeSchemaTypes(node.type)).slice(0, 8) || [],
    imageCount: page.media?.imageCount || 0,
    imagesWithAlt: page.media?.imagesWithAlt || 0,
    hasForm: page.contact?.hasForm || false,
    hasPhone: (page.contact?.phones?.length || 0) > 0,
    hasEmail: (page.contact?.emails?.length || 0) > 0,
  };
}

function normalizeSchemaTypes(type) {
  if (!type) return [];
  return Array.isArray(type) ? type.filter(Boolean) : [type];
}
