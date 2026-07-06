import { NextResponse } from 'next/server';
import { runAudit } from '../../../lib/audit/index.js';
import { persistAudit } from '../../../lib/audit/persistence.js';

export const runtime = 'nodejs';
export const maxDuration = 300;

export async function POST(request) {
  try {
    const body = await request.json();
    const url = body.url || body.domain;

    if (!url) {
      return NextResponse.json(
        { error: 'A website URL or domain is required' },
        { status: 400 }
      );
    }

    const { audit, compatibility } = await runAudit({
      url,
      companyName: body.companyName || '',
      industry: body.industry || '',
      city: body.city || '',
      competitors: body.competitors || body.competitorUrls || [],
      maxPages: body.maxPages || 250,
      maxDurationMs: body.maxDurationMs || 150000,
      maxCompetitorPages: body.maxCompetitorPages || 25,
    });

    const persistence = await persistAudit(audit, compatibility);

    return NextResponse.json({
      ...compatibility,
      audit: summarizeAuditForResponse(audit),
      persistence,
    });
  } catch (error) {
    console.error('Analysis error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to analyze website' },
      { status: 500 }
    );
  }
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
