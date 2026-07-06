import { NextResponse } from 'next/server';
import { getSupabaseConfig, supabaseRequest } from '../../../lib/supabase.js';

export const runtime = 'nodejs';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SEND_COLUMNS = 'id,domain,prospect_name,prospect_email,sent_at,first_opened_at,last_opened_at,open_count';

// Records that a report was sent to a prospect and returns the send id used
// to build the tracked report link (/r/<id>).
export async function POST(request) {
  const config = getSupabaseConfig();
  if (!config) {
    return NextResponse.json(
      { error: 'Send tracking needs Supabase: set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.' },
      { status: 503 }
    );
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Request body must be valid JSON' }, { status: 400 });
  }

  const validationError = validateSend(body);
  if (validationError) {
    return NextResponse.json({ error: validationError }, { status: 400 });
  }

  try {
    const rows = await supabaseRequest(config, '/report_sends', {
      method: 'POST',
      headers: { Prefer: 'return=representation' },
      body: JSON.stringify({
        audit_id: body.auditId,
        client_id: body.clientId || null,
        domain: body.domain,
        prospect_name: (body.prospectName || '').trim() || null,
        prospect_email: body.prospectEmail.trim().toLowerCase(),
      }),
    });

    const row = Array.isArray(rows) ? rows[0] : rows;
    if (!row?.id) throw new Error('Supabase did not return a send id');
    return NextResponse.json({ send: row });
  } catch (error) {
    console.error('Create send error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// Lists past sends for a domain so the workspace can show "already sent to X,
// opened N times".
export async function GET(request) {
  const config = getSupabaseConfig();
  if (!config) {
    return NextResponse.json(
      { error: 'Send tracking needs Supabase: set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.' },
      { status: 503 }
    );
  }

  const domain = request.nextUrl.searchParams.get('domain') || '';
  if (!domain || domain.length > 253) {
    return NextResponse.json({ error: 'A "domain" query parameter is required' }, { status: 400 });
  }

  try {
    const rows = await supabaseRequest(
      config,
      `/report_sends?domain=eq.${encodeURIComponent(domain)}&select=${SEND_COLUMNS}&order=sent_at.desc&limit=25`,
      { method: 'GET' }
    );
    return NextResponse.json({ sends: rows || [] });
  } catch (error) {
    console.error('List sends error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

function validateSend(body) {
  if (!body || typeof body !== 'object') return 'A JSON body is required';
  if (!body.auditId || !UUID_PATTERN.test(body.auditId)) {
    return 'A saved audit is required before tracking a send (run the audit with Supabase configured)';
  }
  if (body.clientId && !UUID_PATTERN.test(body.clientId)) return 'clientId must be a UUID';
  if (!body.domain || typeof body.domain !== 'string' || body.domain.length > 253) return 'A domain is required';
  if (!body.prospectEmail || typeof body.prospectEmail !== 'string' || !EMAIL_PATTERN.test(body.prospectEmail.trim())) {
    return 'A valid prospect email is required';
  }
  if (body.prospectName != null && (typeof body.prospectName !== 'string' || body.prospectName.length > 200)) {
    return 'prospectName must be a string of at most 200 characters';
  }
  return null;
}
