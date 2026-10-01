import { beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('../lib/audit/index.js', () => ({ runAudit: vi.fn() }));
vi.mock('../lib/audit/persistence.js', () => ({ persistAudit: vi.fn() }));
vi.mock('../lib/audit/summarize.js', () => ({ summarizeAuditForResponse: () => ({ safe: true }) }));
vi.mock('../lib/dashboard-admission.js', () => ({ reserveDashboardAudit: vi.fn() }));
import { runAudit } from '../lib/audit/index.js';
import { persistAudit } from '../lib/audit/persistence.js';
import { reserveDashboardAudit } from '../lib/dashboard-admission.js';
import { POST } from '../app/api/analyze/route.js';

const request = () => new Request('https://audit.example/api/analyze', { method: 'POST', body: JSON.stringify({ url: 'https://example.com' }) });
beforeEach(() => vi.clearAllMocks());
describe('analyze admission lifecycle', () => {
  it('does not crawl when shared controls reject the request', async () => {
    reserveDashboardAudit.mockResolvedValue({ allowed: false, status: 429, retryAfter: 600, error: 'Too many audits' });
    const response = await POST(request());
    expect(response.status).toBe(429);
    expect(response.headers.get('Retry-After')).toBe('600');
    expect(runAudit).not.toHaveBeenCalled();
  });
  it.each(['success', 'audit failure', 'persistence failure'])('releases capacity after %s', async outcome => {
    const release = vi.fn();
    reserveDashboardAudit.mockResolvedValue({ allowed: true, release });
    runAudit.mockResolvedValue({ audit: {}, compatibility: {} });
    persistAudit.mockResolvedValue({ status: 'saved' });
    if (outcome === 'audit failure') runAudit.mockRejectedValue(new Error('Crawl unavailable'));
    if (outcome === 'persistence failure') persistAudit.mockRejectedValue(new Error('Persistence unavailable'));
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    const response = await POST(request());
    const text = await response.text();
    expect(text).toContain(outcome === 'success' ? '"type":"result"' : '"type":"error"');
    expect(release).toHaveBeenCalledTimes(1);
    log.mockRestore();
  });
});
