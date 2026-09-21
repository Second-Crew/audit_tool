import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../lib/audit/crawler.js', () => ({ crawlSite: vi.fn() }));
vi.mock('../lib/audit/pagespeed.js', () => ({ getPageSpeedBundle: vi.fn().mockResolvedValue({ scores: {}, metrics: {}, available: false }) }));
vi.mock('../lib/audit/llm.js', () => ({ generateAuditNarrative: vi.fn().mockResolvedValue({ status: 'skipped' }) }));
vi.mock('../lib/audit/typesafe.js', () => ({ evaluateTypeSafe: vi.fn() }));

import { crawlSite } from '../lib/audit/crawler.js';
import { evaluateTypeSafe } from '../lib/audit/typesafe.js';
import { runAudit } from '../lib/audit/index.js';
import { summarizeAuditForResponse } from '../lib/audit/summarize.js';

const crawl = {
  domain: 'example.com', startUrl: 'https://example.com/', origin: 'https://example.com',
  pages: [{ url: 'https://example.com/', status: 200, headers: {}, html: '<html><head><title>Plumbing</title></head><body><h1>Plumbing services</h1><p>We provide drain clearing services.</p></body></html>' }],
  errors: [], blockedByRobots: [], summary: { crawledPages: 1, stoppedBy: 'queue_empty' },
  auxiliary: {
    robots: { found: false, body: '', status: 404, url: 'https://example.com/robots.txt' },
    llms: { found: false, body: '', status: 404, url: 'https://example.com/llms.txt' },
    sitemap: { found: false, urls: [], status: 404, url: 'https://example.com/sitemap.xml' },
  },
};
beforeEach(() => { vi.clearAllMocks(); crawlSite.mockResolvedValue(crawl); });

describe('TypeSafe integration boundary', () => {
  it('persists the assessment in the workspace without changing client grades or exports', async () => {
    evaluateTypeSafe.mockResolvedValueOnce({ status: 'skipped', score: null });
    const baseline = await runAudit({ url: 'https://example.com' });
    const semantic = { status: 'completed', score: 99, pages: [{ excerpt: 'PILOT_ONLY_EVIDENCE' }], outreachEligible: false };
    evaluateTypeSafe.mockResolvedValueOnce(semantic);
    const pilot = await runAudit({ url: 'https://example.com' });
    expect(pilot.compatibility.scores).toEqual(baseline.compatibility.scores);
    expect(summarizeAuditForResponse(pilot.audit).semantic).toEqual(semantic);
    expect(pilot.compatibility.html).not.toContain('PILOT_ONLY_EVIDENCE');
    expect(pilot.compatibility.markdown).not.toContain('PILOT_ONLY_EVIDENCE');
    expect(pilot.audit.primary.scoring.findings).toEqual(baseline.audit.primary.scoring.findings);
  });

  it('refuses website grades or semantic calls when the primary crawl fails', async () => {
    crawlSite.mockResolvedValue({ ...crawl, pages: [], errors: [{ status: 503 }] });
    await expect(runAudit({ url: 'https://example.com' })).rejects.toThrow('No website scores were calculated');
    expect(evaluateTypeSafe).not.toHaveBeenCalled();
  });
});
