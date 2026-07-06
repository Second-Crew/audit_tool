import { getSupabaseConfig, supabaseRequest } from '../supabase.js';

export async function persistAudit(audit, compatibility) {
  const config = getSupabaseConfig();

  if (!config) {
    return {
      enabled: false,
      status: 'skipped',
      reason: 'SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are not configured',
    };
  }

  try {
    const client = await upsertClient(config, audit);
    const auditRow = await insertAudit(config, client.id, audit, compatibility);

    return {
      enabled: true,
      status: 'saved',
      clientId: client.id,
      auditId: auditRow.id,
    };
  } catch (error) {
    return {
      enabled: true,
      status: 'failed',
      reason: error.message,
    };
  }
}

async function upsertClient(config, audit) {
  const domain = audit.primary.signals.domain;
  const payload = {
    domain,
    company_name: audit.input.companyName || domain,
    industry: audit.input.industry || null,
    city: audit.input.city || null,
    updated_at: new Date().toISOString(),
  };

  const response = await supabaseRequest(config, `/clients?on_conflict=domain`, {
    method: 'POST',
    headers: {
      Prefer: 'resolution=merge-duplicates,return=representation',
    },
    body: JSON.stringify(payload),
  });

  const row = Array.isArray(response) ? response[0] : response;
  if (!row?.id) throw new Error('Supabase did not return a client id');
  return row;
}

async function insertAudit(config, clientId, audit, compatibility) {
  const payload = {
    client_id: clientId,
    domain: audit.primary.signals.domain,
    requested_url: audit.input.url,
    status: 'completed',
    crawl_summary: audit.primary.signals.crawl.summary,
    scores: compatibility.scores,
    findings: audit.primary.scoring.findings,
    category_details: audit.primary.scoring.categoryDetails,
    competitors: audit.competitorComparison,
    report: {
      executive_summary: compatibility.aiInsights.executiveSummary,
      top_issues: compatibility.aiInsights.topIssues,
      quick_wins: compatibility.aiInsights.quickWins,
      score_narrative: compatibility.aiInsights.scoreNarrative || [],
      roadmap: compatibility.aiInsights.roadmap || [],
      caveats: compatibility.aiInsights.caveats || [],
      llm: compatibility.llm,
      html: compatibility.html,
    },
    created_at: audit.createdAt,
  };

  const response = await supabaseRequest(config, '/audits', {
    method: 'POST',
    headers: {
      Prefer: 'return=representation',
    },
    body: JSON.stringify(payload),
  });

  const row = Array.isArray(response) ? response[0] : response;
  if (!row?.id) throw new Error('Supabase did not return an audit id');
  return row;
}
