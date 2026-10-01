import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('../lib/supabase.js', () => ({ getSupabaseConfig: () => ({}), supabaseRequest: vi.fn() }));
import { supabaseRequest } from '../lib/supabase.js';
import { persistAudit } from '../lib/audit/persistence.js';
import { GET as history } from '../app/api/history/route.js';
import { GET as reopen } from '../app/api/audits/[id]/route.js';
import { GET as listSends, POST as createSend } from '../app/api/sends/route.js';

const id = '11000000-0000-0000-0000-000000000001';
beforeEach(() => {
  supabaseRequest.mockRejectedValue(new Error('private database key and row contents'));
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());
describe('storage failure boundaries', () => {
  it('marks a failed save explicitly without exposing database details', async () => {
    const result = await persistAudit({ primary: { signals: { domain: 'example.com' } }, input: {} }, {});
    expect(result).toMatchObject({ enabled: true, status: 'failed' });
    expect(result.reason).toContain('not available in history');
    expect(JSON.stringify(result)).not.toContain('private database');
  });
  it('returns safe errors for history, reopening and send tracking', async () => {
    const responses = await Promise.all([
      history(), reopen({}, { params: { id } }),
      listSends({ nextUrl: new URL('https://audit.example/api/sends?domain=example.com') }),
      createSend(new Request('https://audit.example/api/sends', { method: 'POST', body: JSON.stringify({ auditId: id, domain: 'example.com', prospectEmail: 'test@example.com' }) })),
    ]);
    for (const response of responses) {
      expect(response.status).toBe(500);
      expect(await response.text()).not.toContain('private database');
    }
    expect(console.error.mock.calls.flat().join(' ')).not.toContain('private database');
  });
});
