import { getSupabaseConfig, supabaseRequest } from '../../../lib/supabase.js';

export const runtime = 'nodejs';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Tracked report link sent to prospects: serves the stored report HTML for
// the send and records the open. Every visit counts, including the sender's
// own preview opens.
export async function GET(request, { params }) {
  const sendId = params.id;
  if (!UUID_PATTERN.test(sendId)) {
    return htmlMessage(404, 'Report not found', 'This report link is not valid.');
  }

  const config = getSupabaseConfig();
  if (!config) {
    return htmlMessage(503, 'Reports unavailable', 'Report hosting is not configured on this deployment.');
  }

  try {
    // Atomic increment + lookup in one call; concurrent opens all count.
    const auditId = await supabaseRequest(config, '/rpc/record_report_open', {
      method: 'POST',
      body: JSON.stringify({ send_id: sendId }),
    });
    if (!auditId) {
      return htmlMessage(404, 'Report not found', 'This report link does not exist or was removed.');
    }

    const audits = await supabaseRequest(
      config,
      `/audits?id=eq.${auditId}&select=report`,
      { method: 'GET' }
    );
    const html = Array.isArray(audits) ? audits[0]?.report?.html : null;
    if (!html) {
      return htmlMessage(404, 'Report not found', 'The report for this link is no longer available.');
    }

    return new Response(html, {
      status: 200,
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'no-store',
        'X-Robots-Tag': 'noindex',
      },
    });
  } catch (error) {
    console.error('Report link error:', error);
    return htmlMessage(500, 'Something went wrong', 'The report could not be loaded. Please try again.');
  }
}

function htmlMessage(status, title, detail) {
  return new Response(
    `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><title>${title}</title></head>
<body style="font-family:Arial,sans-serif;background:#f8fafc;color:#0f172a;display:flex;min-height:100vh;align-items:center;justify-content:center;margin:0">
<div style="text-align:center;padding:24px"><h1 style="font-size:22px">${title}</h1><p style="color:#64748b">${detail}</p></div>
</body></html>`,
    { status, headers: { 'Content-Type': 'text/html; charset=utf-8' } }
  );
}
