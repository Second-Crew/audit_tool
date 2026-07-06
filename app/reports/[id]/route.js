import { getSupabaseConfig, supabaseRequest } from '../../../lib/supabase.js';

export const runtime = 'nodejs';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Workspace-side view of a stored report by audit id, used by the history
// panel. Unlike the prospect link (/r/<send id>), this route sits behind the
// team login gate and does not count as an open.
export async function GET(request, { params }) {
  const auditId = params.id;
  if (!UUID_PATTERN.test(auditId)) {
    return new Response('Not found', { status: 404 });
  }

  const config = getSupabaseConfig();
  if (!config) {
    return new Response('Supabase is not configured on this deployment', { status: 503 });
  }

  try {
    const rows = await supabaseRequest(config, `/audits?id=eq.${auditId}&select=report`, { method: 'GET' });
    const html = Array.isArray(rows) ? rows[0]?.report?.html : null;
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
