import { NextResponse } from 'next/server';
import { getSupabaseConfig, supabaseRequest } from '../../../lib/supabase.js';

export const runtime = 'nodejs';

// Diagnostic history for the workspace home screen: recent audits with the
// client they belong to and every logged send with its open status.
export async function GET() {
  const config = getSupabaseConfig();
  if (!config) {
    return NextResponse.json(
      { error: 'History needs Supabase: set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.' },
      { status: 503 }
    );
  }

  try {
    const rows = await supabaseRequest(
      config,
      '/audits?select=id,domain,requested_url,created_at,scores,client:clients(company_name),sends:report_sends(id,prospect_name,prospect_email,sent_at,open_count,last_opened_at)&order=created_at.desc&limit=50',
      { method: 'GET' }
    );
    return NextResponse.json({ audits: rows || [] });
  } catch (error) {
    console.error('History error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
