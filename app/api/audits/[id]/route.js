import { NextResponse } from 'next/server';
import { getSupabaseConfig, supabaseRequest } from '../../../../lib/supabase.js';

export const runtime = 'nodejs';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Rebuilds the client workspace payload for a stored audit so the dashboard
// can reopen past reports in the full tabbed UI without re-crawling.
export async function GET(request, { params }) {
  const auditId = params.id;
  if (!UUID_PATTERN.test(auditId)) {
    return NextResponse.json({ error: 'Invalid audit id' }, { status: 404 });
  }

  const config = getSupabaseConfig();
  if (!config) {
    return NextResponse.json({ error: 'Supabase is not configured on this deployment' }, { status: 503 });
  }

  try {
    const rows = await supabaseRequest(
      config,
      `/audits?id=eq.${auditId}&select=id,client_id,domain,requested_url,created_at,scores,findings,category_details,competitors,crawl_summary,report,client:clients(company_name)`,
      { method: 'GET' }
    );
    const row = Array.isArray(rows) ? rows[0] : null;
    if (!row) return NextResponse.json({ error: 'Audit not found' }, { status: 404 });

    const report = row.report || {};
    const data = {
      scores: row.scores || {},
      aiInsights: {
        executiveSummary: report.executive_summary,
        topIssues: report.top_issues || [],
        quickWins: report.quick_wins || [],
        scoreNarrative: report.score_narrative || [],
        roadmap: report.roadmap || [],
        caveats: report.caveats || [],
      },
      aiReadiness: { features: { aiBotAccess: report.ai_bot_access || {} } },
      llm: report.llm || { status: 'skipped' },
      html: report.html || '',
      markdown: report.markdown || null,
      audit: report.workspace || buildFallbackWorkspace(row),
      persistence: { enabled: true, status: 'saved', clientId: row.client_id, auditId: row.id },
      companyName: row.client?.company_name || row.domain,
    };

    return NextResponse.json(data);
  } catch (error) {
    console.error('Load stored audit error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// Audits saved before workspace storage lack per-page data; everything else
// reconstructs from the stored columns, so the tabs still work (the Crawl
// page lists and page-by-page plan just come back empty).
function buildFallbackWorkspace(row) {
  return {
    createdAt: row.created_at,
    elapsedMs: null,
    input: { url: row.requested_url },
    primary: {
      domain: row.domain,
      startUrl: row.requested_url,
      pageCount: row.crawl_summary?.crawledPages ?? 0,
      pages: [],
      crawl: { summary: row.crawl_summary || {}, auxiliary: {} },
      schema: { found: false, count: 0, types: [], invalidCount: 0 },
      content: { faqPages: [], servicePages: [], productPages: [], locationPages: [], comparisonPages: [], topicalDepth: 0 },
      scores: row.scores || {},
      findings: row.findings || [],
      categoryDetails: row.category_details || {},
    },
    competitorComparison: row.competitors || [],
    llm: row.report?.llm || { status: 'skipped' },
    pageSpeed: { available: false, scores: {}, metrics: {} },
  };
}
