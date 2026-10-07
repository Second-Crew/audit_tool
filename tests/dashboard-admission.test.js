import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('../lib/supabase.js', () => ({ getSupabaseConfig: vi.fn(), supabaseRequest: vi.fn() }));
import { getSupabaseConfig, supabaseRequest } from '../lib/supabase.js';
import { reserveDashboardAudit } from '../lib/dashboard-admission.js';

const leaseId = '11000000-0000-0000-0000-000000000001';
const request = () => new Request('https://audit.example/api/analyze', { headers: { 'x-forwarded-for': '192.0.2.12, 192.0.2.13' } });
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv('VERCEL_ENV', 'production');
  vi.stubEnv('DASHBOARD_SHARED_LIMITS_ENABLED', 'true');
  getSupabaseConfig.mockReturnValue({ url: 'https://db.example', serviceRoleKey: 'test-server-secret' });
});
afterEach(() => vi.unstubAllEnvs());

describe('shared dashboard admission', () => {
  it.each(['production', 'preview'])('fails closed in %s before activation and on absent configuration', async environment => {
    vi.stubEnv('VERCEL_ENV', environment);
    vi.stubEnv('DASHBOARD_SHARED_LIMITS_ENABLED', 'false');
    expect(await reserveDashboardAudit(request())).toMatchObject({ allowed: false, status: 503 });
    vi.stubEnv('DASHBOARD_SHARED_LIMITS_ENABLED', 'true');
    getSupabaseConfig.mockReturnValue(null);
    expect(await reserveDashboardAudit(request())).toMatchObject({ allowed: false, status: 503 });
    expect(supabaseRequest).not.toHaveBeenCalled();
  });
  it('hashes the client, uses one atomic reservation, and releases exactly once', async () => {
    supabaseRequest.mockResolvedValue({ leaseId });
    const reservation = await reserveDashboardAudit(request());
    expect(reservation.allowed).toBe(true);
    const payload = JSON.parse(supabaseRequest.mock.calls[0][2].body);
    expect(payload.p_scope).toBe('dashboard:production');
    expect(payload.p_client_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(JSON.stringify(payload)).not.toContain('192.0.2.12');
    await reservation.release();
    await reservation.release();
    expect(supabaseRequest).toHaveBeenCalledTimes(2);
    expect(supabaseRequest.mock.calls[1][1]).toBe('/rpc/release_dashboard_audit');
    expect(JSON.parse(supabaseRequest.mock.calls[1][2].body)).toEqual({ p_lease_id: leaseId });
  });
  it('separates Preview from Production capacity', async () => {
    supabaseRequest.mockResolvedValue({ leaseId });
    await reserveDashboardAudit(request());
    vi.stubEnv('VERCEL_ENV', 'preview');
    await reserveDashboardAudit(request());
    const [production, preview] = supabaseRequest.mock.calls.map(call => JSON.parse(call[2].body));
    expect(preview.p_scope).toBe('dashboard:preview');
    expect(preview.p_client_hash).not.toBe(production.p_client_hash);
  });
  it.each([['rate_limit', 429, 600], ['busy', 503, 60]])('returns the %s gate', async (error, status, retryAfter) => {
    supabaseRequest.mockResolvedValue({ error });
    expect(await reserveDashboardAudit(request())).toMatchObject({ allowed: false, status, retryAfter });
  });
  it('fails closed without disclosing database failures or accepting malformed leases', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    supabaseRequest.mockRejectedValue(new Error('private database credential'));
    const result = await reserveDashboardAudit(request());
    expect(result).toMatchObject({ allowed: false, status: 503 });
    expect(JSON.stringify(result)).not.toContain('credential');
    expect(log.mock.calls.flat().join(' ')).not.toContain('credential');
    supabaseRequest.mockResolvedValue({ leaseId: 'unverified' });
    expect(await reserveDashboardAudit(request())).toMatchObject({ allowed: false, status: 503 });
    log.mockRestore();
  });
});
