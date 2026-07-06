import { getSupabaseConfig, supabaseRequest } from '../../../lib/supabase.js';
import { buildMarkdownReport } from '../../../lib/audit/markdown.js';
import { buildActionPlan } from '../../../lib/action-plan.js';

export const runtime = 'nodejs';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Workspace-side view of a stored report by audit id, used by the history
// panel. Unlike the prospect link (/r/<send id>), this route sits behind the
// team login gate and does not count as an open. ?format=markdown downloads
// the LLM-ready Markdown version instead of the HTML report.
export async function GET(request, { params }) {
  const auditId = params.id;
  if (!UUID_PATTERN.test(auditId)) {
    return new Response('Not found', { status: 404 });
  }

  const config = getSupabaseConfig();
  if (!config) {
    return new Response('Supabase is not configured on this deployment', { status: 503 });
  }

  const wantsMarkdown = request.nextUrl.searchParams.get('format') === 'markdown';

  try {
    const rows = await supabaseRequest(
      config,
      `/audits?id=eq.${auditId}&select=report,domain,requested_url,created_at,scores,findings,category_details,competitors,crawl_summary,client:clients(company_name)`,
      { method: 'GET' }
    );
    const row = Array.isArray(rows) ? rows[0] : null;
    if (!row) return new Response('Report not found', { status: 404 });

    if (wantsMarkdown) {
      const markdown = row.report?.markdown || buildStoredMarkdown(row);
      return new Response(markdown, {
        status: 200,
        headers: {
          'Content-Type': 'text/markdown; charset=utf-8',
          'Content-Disposition': `attachment; filename="${row.domain.replace(/[^a-z0-9.-]/gi, '_')}-audit.md"`,
          'Cache-Control': 'no-store',
        },
      });
    }

    const html = row.report?.html;
    if (!html) return new Response('Report not found', { status: 404 });

    return new Response(html, {
      status: 200,
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'no-store',
        'X-Robots-Tag': 'noindex',
      },
    });
  } catch (error) {
    console.error('Stored report error:', error);
    return new Response('The report could not be loaded', { status: 500 });
  }
}

// Audits saved before Markdown export existed have no stored markdown; build
// it from the stored evidence (everything except the page-by-page plan, since
// per-page data is not persisted).
function buildStoredMarkdown(row) {
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
    scores: row.scores || {},
    findings: row.findings || [],
    categoryDetails: row.category_details || {},
    competitorComparison: row.competitors || [],
    aiInsights,
    actionPlan: buildActionPlan({ aiInsights }, { pages: [] }, row.category_details || {}, row.findings || []),
  });
}
