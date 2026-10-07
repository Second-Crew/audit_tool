import { createHmac } from 'node:crypto';
import { getSupabaseConfig, supabaseRequest } from './supabase.js';

// The database lease outlasts Vercel's 300-second function lifetime. A crashed
// instance holds capacity conservatively until expiry instead of releasing a
// slot while its audit might still be running.
const requestLog = new Map();
let runningAudits = 0;

export async function reserveDashboardAudit(request) {
  const shared = process.env.DASHBOARD_SHARED_LIMITS_ENABLED === 'true';
  if (!shared && ['production', 'preview'].includes(process.env.VERCEL_ENV)) return unavailable();
  const address = request.headers.get('x-forwarded-for')?.split(',')[0].trim()
    || request.headers.get('x-real-ip') || 'local';
  if (!shared) return reserveLocal(address);

  const config = getSupabaseConfig();
  if (!config) return unavailable();
  const scope = process.env.VERCEL_ENV === 'production' ? 'dashboard:production'
    : process.env.VERCEL_ENV === 'preview' ? 'dashboard:preview' : 'dashboard:local';
  // Store neither raw IP addresses nor credentials in the admission tables.
  const clientHash = createHmac('sha256', config.serviceRoleKey).update(`${scope}:${address}`).digest('hex');
  try {
    const result = await supabaseRequest(config, '/rpc/reserve_dashboard_audit', {
      method: 'POST', body: JSON.stringify({ p_scope: scope, p_client_hash: clientHash }),
    });
    if (result?.error === 'rate_limit') return rateLimited();
    if (result?.error === 'busy') return busy();
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(result?.leaseId || '')) return unavailable();
    let released = false;
    return { allowed: true, async release() {
      if (released) return;
      released = true;
      try {
        await supabaseRequest(config, '/rpc/release_dashboard_audit', {
          method: 'POST', body: JSON.stringify({ p_lease_id: result.leaseId }),
        });
      } catch {
        // Keep the lease until expiry. Do not disclose database errors/keys.
        console.error('Dashboard audit lease release failed');
      }
    } };
  } catch {
    console.error('Dashboard audit admission unavailable');
    return unavailable();
  }
}

function unavailable() {
  return { allowed: false, status: 503, retryAfter: 60, error: 'Shared audit controls are unavailable. Try again later.' };
}
function rateLimited() {
  return { allowed: false, status: 429, retryAfter: 600, error: 'Too many audits from this address. Try again in a few minutes.' };
}
function busy() {
  return { allowed: false, status: 503, retryAfter: 60, error: 'The audit service is busy. Try again in a couple of minutes.' };
}

// Local development only. Hosted deployments require shared admission so an
// inherited/missing flag cannot silently fall back to per-process capacity.
function reserveLocal(address) {
  const cutoff = Date.now() - 600000;
  const timestamps = (requestLog.get(address) || []).filter(time => time > cutoff);
  if (timestamps.length >= 5) return rateLimited();
  timestamps.push(Date.now());
  requestLog.set(address, timestamps);
  for (const [key, values] of requestLog) {
    if (!values.some(time => time > cutoff)) requestLog.delete(key);
  }
  if (runningAudits >= 2) return busy();
  runningAudits += 1;
  let released = false;
  return { allowed: true, async release() {
    if (!released) runningAudits -= 1;
    released = true;
  } };
}
