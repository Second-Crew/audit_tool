import { getSupabaseConfig, supabaseRequest } from '../../../lib/supabase.js';
import { buildMarkdownReport } from '../../../lib/audit/markdown.js';
import { buildActionPlan } from '../../../lib/action-plan.js';
import { labelLegacyHtml, labelLegacyMarkdown } from '../../../lib/audit/legacy.js';

export const runtime = 'nodejs';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Workspace-side view of a stored report by audit id, used by the history
// panel. Unlike the prospect link (/r/<send id>), this route sits behind the
// team login gate and does not count as an open. ?format=markdown downloads
// the LLM-ready Markdown version instead of the HTML report.
export async function GET(request, { params }) {
  const { id: auditId } = await params;
  if (!UUID_PATTERN.test(auditId)) {
    return new Response('Not found', { status: 404 });
  }

  const config = getSupabaseConfig();
  if (!config) {
    return new Response('Supabase is not configured on this deployment', { status: 503 });
  }

  const wantsMarkdown = request.nextUrl.searchParams.get('format') === 'markdown';
  const previewMarkdown = wantsMarkdown && request.nextUrl.searchParams.get('preview') === '1';

  try {
    const rows = await supabaseRequest(
      config,
      `/audits?id=eq.${auditId}&select=report,domain,requested_url,created_at,scores,findings,category_details,competitors,crawl_summary,client:clients(company_name)`,
      { method: 'GET' }
    );
    const row = Array.isArray(rows) ? rows[0] : null;
    if (!row) return new Response('Report not found', { status: 404 });

    if (wantsMarkdown) {
      const markdown = labelLegacyMarkdown(row.report?.markdown || buildStoredMarkdown(row), row.scores);
      return new Response(markdown, {
        status: 200,
        headers: {
          'Content-Type': previewMarkdown ? 'text/plain; charset=utf-8' : 'text/markdown; charset=utf-8',
          'Content-Disposition': `${previewMarkdown ? 'inline' : 'attachment'}; filename="${row.domain.replace(/[^a-z0-9.-]/gi, '_')}-audit.md"`,
          'Cache-Control': 'no-store',
          'X-Robots-Tag': 'noindex',
          'X-Content-Type-Options': 'nosniff',
        },
      });
    }

    const checklist = row.report?.ai_technical_readiness || row.report?.workspace?.aiTechnicalReadiness;
    const html = row.report?.html || (checklist ? buildFallbackHtml(buildStoredMarkdown(row)) : null);
    if (!html) return new Response('Report not found', { status: 404 });

    return new Response(labelLegacyHtml(html, row.scores), {
      status: 200,
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'no-store',
        'X-Robots-Tag': 'noindex',
      },
    });
  } catch (error) {
    console.error('Stored report could not be loaded');
    return new Response('The report could not be loaded', { status: 500 });
  }
}

// Reconstruct missing Markdown from saved evidence, including the panel
// aggregates and per-page workspace when available. Never expose the raw panel.
function buildStoredMarkdown(row) {
  const primary = row.report?.workspace?.primary || { pages: [] };
  const aiInsights = {
    executiveSummary: row.report?.executive_summary,
    roadmap: row.report?.roadmap || [],
    caveats: row.report?.caveats || [],
  };

  return buildMarkdownReport({
    companyName: row.client?.company_name || row.domain,
    domain: row.domain,
    startUrl: row.requested_url,
    createdAt: row.created_at,
    pageCount: row.crawl_summary?.crawledPages ?? null,
    siteType: primary.siteType,
    contentEvidence: primary.contentEvidence,
    observedVisibility: row.report?.observed_visibility || row.report?.workspace?.observedVisibility || null,
    aiTechnicalReadiness: row.report?.ai_technical_readiness || row.report?.workspace?.aiTechnicalReadiness || null,
    scores: row.scores || {},
    pageSpeedDiagnostics: row.report?.workspace?.pageSpeed?.diagnostics || {},
    findings: row.findings || [],
    categoryDetails: row.category_details || {},
    competitorComparison: row.competitors || [],
    aiInsights,
    actionPlan: buildActionPlan({ aiInsights, scores: row.scores || {} }, primary, row.category_details || {}, row.findings || []),
  });
}

// Reconstruct only from saved measurements; no recrawl or retrospective scoring.
function buildFallbackHtml(markdown) {
  const escaped = markdown.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Saved audit evidence</title></head><body><main style="max-width:1100px;margin:32px auto;padding:16px"><p>Reconstructed from saved audit evidence; original HTML export unavailable.</p><pre style="white-space:pre-wrap;overflow-wrap:anywhere;font:14px/1.6 Arial,sans-serif">${escaped}</pre></main></body></html>`;
}
