import { readFileSync } from 'node:fs';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { assembleObservedPanel } from '../scripts/assemble-observed-panel.mjs';
import { visibilityEngineRows } from '../lib/audit/visibility-display.js';

vi.mock('../lib/audit/crawler.js', () => ({ crawlSite: vi.fn() }));
vi.mock('../lib/audit/render.js', () => ({ renderSparsePages: vi.fn() }));
vi.mock('../lib/audit/pagespeed.js', () => ({ getPageSpeedBundle: vi.fn().mockResolvedValue({ scores: {}, metrics: {}, available: false }) }));
vi.mock('../lib/audit/llm.js', () => ({ generateAuditNarrative: vi.fn() }));
vi.mock('../lib/audit/typesafe.js', () => ({ evaluateTypeSafe: vi.fn().mockResolvedValue({ status: 'skipped' }) }));
vi.mock('../lib/supabase.js', () => ({ getSupabaseConfig: () => ({}), supabaseRequest: vi.fn() }));
import { crawlSite } from '../lib/audit/crawler.js';
import { getPageSpeedBundle } from '../lib/audit/pagespeed.js';
import { runAudit } from '../lib/audit/index.js';
import { persistAudit } from '../lib/audit/persistence.js';
import { supabaseRequest } from '../lib/supabase.js';
import { GET as reopen } from '../app/api/audits/[id]/route.js';
import { GET as exportReport } from '../app/reports/[id]/route.js';

const load = name => JSON.parse(readFileSync(new URL(`../docs/${name}`, import.meta.url), 'utf8'));
const { panel, assessment } = assembleObservedPanel(load('calibration-query-panel.json'),
  load('query-panel-chatgpt-later-draft.json').observations, load('query-panel-google-ai-mode-draft.json').observations,
  Date.parse('2026-10-01T22:00:00Z'));
const id = '11000000-0000-0000-0000-000000000001';
let stored;

beforeEach(() => {
  getPageSpeedBundle.mockResolvedValue({ scores: {mobile:58,desktop:91}, metrics: {}, available: true,
    diagnostics: {desktop:{status:'available',reason:null,attempts:1},mobile:{status:'available',reason:null,attempts:1}} });
  vi.spyOn(Date, 'now').mockReturnValue(Date.parse('2026-10-01T22:00:00Z'));
  crawlSite.mockResolvedValue({
    domain: 'secondcrew.com', startUrl: 'https://secondcrew.com/', origin: 'https://secondcrew.com',
    pages: [{ url: 'https://secondcrew.com/', status: 200, headers: {}, html: '<html><head><title>Fixture</title><meta name="description" content="Local storage fixture"></head><body><h1>Website services</h1><p>This is a synthetic page for the local storage regression. It does not represent a fresh crawl or any current website performance measurement.</p></body></html>' }],
    errors: [], blockedByRobots: [], summary: { crawledPages: 1, stoppedBy: 'queue_empty' },
    auxiliary: {
      robots: { found: false, body: '', status: 404, url: 'https://secondcrew.com/robots.txt' },
      llms: { found: false, body: '', status: 404, url: 'https://secondcrew.com/llms.txt' },
      sitemap: { found: false, urls: [], status: 404, url: 'https://secondcrew.com/sitemap.xml' },
    },
  });
  stored = null;
  supabaseRequest.mockImplementation(async (_config, path, options) => {
    if (path.startsWith('/clients?')) return [{ id }];
    if (path === '/audits' && options.method === 'POST') {
      stored = JSON.parse(options.body);
      return [{ id }];
    }
    if (path.startsWith('/audits?')) return [{ ...stored, id, client: { company_name: 'Local storage fixture' } }];
    throw new Error('Unexpected storage call');
  });
});
afterEach(() => vi.restoreAllMocks());

async function saveFixture() {
  const { audit, compatibility } = await runAudit({ url: 'https://secondcrew.com/', companyName: 'Local storage fixture', visibilityPanel: panel });
  expect(await persistAudit(audit, compatibility)).toMatchObject({ status: 'saved', auditId: id });
}
async function markdown() {
  return (await exportReport({ nextUrl: new URL(`https://audit.example/reports/${id}?format=markdown`) }, { params: { id } })).text();
}
function checkMarkdown(text) {
  expect(text).toContain('| GEO/AEO observed visibility | 3 |');
  expect(text).toContain('| ChatGPT Search | 0/30 | 0/100 | 30/30 | 12/30 |');
  expect(text).toContain('| Google AI Mode | 2/30 | 7/100 | 30/30 | 8/30 |');
  expect(text).toContain('2026-09-27 to 2026-09-29');
  expect(text).toContain('Ten queries, three runs per query and engine');
  expect(text).toContain('not a ranking prediction');
  expect(text).toContain('| Overall | Not assessed |');
  expect(text).toContain('| AI readiness | Not assessed |');
  for (const query of panel.queries) expect(text).toContain(query.prompt);
  checkPrivateBoundary(text);
}
function checkPrivateBoundary(text) {
  for (const observation of panel.observations) expect(text).not.toContain(observation.permalink);
  expect(text).not.toContain('"observations"');
  expect(text).not.toContain('Archived score:');
}

describe('completed panel saved-report regression (mock storage, synthetic crawl)', () => {
  it('preserves reviewed aggregates and raw/private separation across save, reopen and exports', async () => {
    await saveFixture();
    expect(stored.report.observed_panel).toEqual(panel);
    expect(stored.report.observed_visibility).toEqual(assessment);
    const response = await reopen({}, { params: { id } });
    const data = await response.json();
    expect(data.scores).toMatchObject({ aeoGeo: 3, overall: null, aiReadiness: null });
    expect(data.observedVisibility).toEqual(assessment);
    expect(data.audit.observedVisibility).toEqual(assessment);
    expect(JSON.stringify(data)).not.toContain('"observations"');
    const html = await exportReport({ nextUrl: new URL(`https://audit.example/reports/${id}`) }, { params: { id } });
    const text = await html.text();
    expect(text).toMatch(/\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}\.\d{3} UTC/);
    expect(text).toContain('<td>ChatGPT Search</td><td>0/30</td><td>0/100</td><td>30/30</td><td>12/30</td>');
    expect(text).toContain('<td>Google AI Mode</td><td>2/30</td><td>7/100</td><td>30/30</td><td>8/30</td>');
    checkPrivateBoundary(text);
    checkMarkdown(await markdown());
  });
  it('rebuilds missing Markdown with the original panel evidence and limitations', async () => {
    await saveFixture();
    delete stored.report.markdown;
    checkMarkdown(await markdown());
    delete stored.report.workspace;
    checkMarkdown(await markdown());
    const data = await (await reopen({}, { params: { id } })).json();
    expect(data.audit.observedVisibility).toEqual(assessment);
    expect(JSON.stringify(data)).not.toContain('"observations"');
  });
  it('does not turn missing aggregate counts into measured zeros', () => {
    const rows = visibilityEngineRows({ engines: assessment.engines });
    expect(rows.map(row => row.citations)).toEqual(['Not available', 'Not available']);
    expect(rows.map(row => row.answers)).toEqual(['Not available', 'Not available']);
  });
  it('preserves desktop results and safe failure status through storage and both export paths', async () => {
    getPageSpeedBundle.mockResolvedValue({scores:{mobile:58,desktop:null},metrics:{},available:true,
      diagnostics:{desktop:{status:'unavailable',reason:'request_timeout',attempts:2},mobile:{status:'available',reason:null,attempts:1}}});
    await saveFixture();
    const data=await (await reopen({}, {params:{id}})).json();
    expect(data.audit.pageSpeed.diagnostics.desktop.reason).toBe('request_timeout');
    expect(data.pageSpeedDiagnostics.desktop.reason).toBe('request_timeout');
    const html=await (await exportReport({nextUrl:new URL(`https://audit.example/reports/${id}`)},{params:{id}})).text();
    expect(html).toContain('Desktop: Measurement unavailable');
    expect(html).toContain('Google PageSpeed did not finish within the request deadline.');
    expect(await markdown()).toContain('**Desktop:** Measurement unavailable. Google PageSpeed did not finish within the request deadline.');
    delete stored.report.markdown;
    expect(await markdown()).toContain('Google PageSpeed did not finish within the request deadline.');
    delete stored.report.workspace;
    expect(await markdown()).toContain('No usable Google PageSpeed measurement was saved for this run.');
  });
  it('keeps the Google desktop score through save, reopen and export without a recrawl', async()=>{
    await saveFixture();
    const data=await (await reopen({}, {params:{id}})).json();
    expect(data.scores.desktop).toBe(91);
    expect(data.audit.pageSpeed.scores.desktop).toBe(91);
    expect(await markdown()).toContain('| Desktop PageSpeed | 91 |');
    expect(await markdown()).toContain('**Desktop:** 91/100.');
    delete stored.report.markdown;
    expect(await markdown()).toContain('**Desktop:** 91/100.');
  });
});
