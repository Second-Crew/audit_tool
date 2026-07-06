import { describe, expect, it } from 'vitest';
import { buildMarkdownReport } from '../lib/audit/markdown.js';

const fixture = {
  companyName: 'Example Co',
  domain: 'example.com',
  startUrl: 'https://example.com/',
  createdAt: '2026-07-06T00:00:00.000Z',
  pageCount: 12,
  scores: { overall: 55, aeoGeo: 48, seo: 62, mobile: 90 },
  findings: [
    {
      title: 'No structured data found',
      severity: 'high',
      category: 'Structured Data',
      description: 'AI systems have fewer explicit facts about the business.',
      evidence: 'No application/ld+json blocks were found',
      recommendation: 'Add JSON-LD for Organization and Service types.',
      confidence: 'high',
      url: 'https://example.com/',
    },
  ],
  categoryDetails: {
    crawlability: {
      name: 'Crawlability',
      score: 70,
      checks: [
        { label: 'Sitemap exists', status: 'passed', score: 14, maxScore: 14, evidence: '40 URLs' },
        { label: 'llms.txt exists', status: 'failed', score: 0, maxScore: 8, evidence: 'llms.txt missing | pipe test' },
      ],
    },
  },
  competitorComparison: [
    { name: 'Rival', domain: 'rival.com', scores: { aeoGeo: 66 }, scoreDiff: 18, gaps: ['Schema coverage: competitor has 12, audited site has 2'], advantages: [] },
    { name: 'Broken', domain: 'broken.example', error: 'Could not resolve host', scores: null, scoreDiff: null, gaps: [], advantages: [] },
  ],
  aiInsights: {
    executiveSummary: 'Example Co scores 55/100 overall.',
    roadmap: [{ phase: 'Now', title: 'Fix schema', actions: ['Add Organization JSON-LD'] }],
    caveats: ['Not a live ranking guarantee.'],
  },
  actionPlan: {
    totalTasks: 3,
    highImpactTasks: 1,
    generalTasks: [{ id: 'g1', title: 'Add structured data', detail: 'Add JSON-LD sitewide.', impact: 'High', effort: 'This week', source: 'Structured Data', evidence: 'None found' }],
    categoryTasks: [{ id: 'c1', title: 'llms.txt exists', detail: 'Create /llms.txt.', impact: 'Medium', effort: '2-4 hours', source: 'Crawlability', evidence: 'missing' }],
    pagePlans: [
      {
        url: 'https://example.com/services',
        title: 'Services',
        contentType: 'service',
        readiness: 60,
        tasks: [{ id: 'p1', title: 'Add FAQ blocks', detail: 'Add 3-5 Q&As.', impact: 'Medium', effort: 'Standard fix', source: 'AEO', evidence: 'No FAQ detected' }],
      },
    ],
  },
};

describe('buildMarkdownReport', () => {
  const markdown = buildMarkdownReport(fixture);

  it('includes header, LLM instructions, and the scores table', () => {
    expect(markdown).toContain('# GEO/AEO Diagnostic Report — Example Co');
    expect(markdown).toContain('How to use this document');
    expect(markdown).toContain('| Overall | 55 |');
    expect(markdown).toContain('| GEO/AEO readiness | 48 |');
  });

  it('includes findings with evidence and recommendations', () => {
    expect(markdown).toContain('### 1. No structured data found (high severity, Structured Data)');
    expect(markdown).toContain('**Evidence:** No application/ld+json blocks were found');
    expect(markdown).toContain('**Recommendation:** Add JSON-LD for Organization and Service types.');
  });

  it('lists only non-passed checks and escapes pipes in table cells', () => {
    expect(markdown).toContain('llms.txt exists | failed (0/8)');
    expect(markdown).not.toContain('Sitemap exists | passed');
    expect(markdown).toContain('llms.txt missing \\| pipe test');
  });

  it('covers competitors including failed crawls', () => {
    expect(markdown).toContain('### Rival (rival.com)');
    expect(markdown).toContain('diff vs audited site: +18');
    expect(markdown).toContain('### Broken — crawl failed');
  });

  it('renders the action plan as checkbox tasks with page sections', () => {
    expect(markdown).toContain('- [ ] **Add structured data** (High impact, This week, Structured Data)');
    expect(markdown).toContain('#### Services (service, readiness 60/100)');
    expect(markdown).toContain('URL: https://example.com/services');
  });

  it('works without an action plan or narrative (stored legacy audits)', () => {
    const minimal = buildMarkdownReport({ companyName: 'X', domain: 'x.com', scores: { overall: 40 }, findings: [], categoryDetails: {}, competitorComparison: [] });
    expect(minimal).toContain('# GEO/AEO Diagnostic Report — X');
    expect(minimal).toContain('## Caveats');
  });
});
