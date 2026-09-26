import { describe, expect, it, vi } from 'vitest';

vi.mock('../lib/audit/index.js', () => ({ runAudit: vi.fn() }));
vi.mock('../lib/audit/persistence.js', () => ({ persistAudit: vi.fn() }));
import { runAudit } from '../lib/audit/index.js';
import { POST } from '../app/api/analyze/route.js';

describe('audit outcome-panel gate', () => {
  it('rejects an incomplete uploaded panel before starting a crawl', async () => {
    const request = new Request('https://audit.example/api/analyze', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: 'https://secondcrew.com/', visibilityPanel: { targetDomain: 'secondcrew.com', queries: [], observations: [] } }),
    });
    const response = await POST(request);
    expect(response.status).toBe(422);
    expect((await response.json()).error).toContain('Observed GEO/AEO score withheld');
    expect(runAudit).not.toHaveBeenCalled();
  });
});
