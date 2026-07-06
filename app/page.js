'use client';

import { useMemo, useState } from 'react';

const tabs = [
  { id: 'overview', label: 'Overview' },
  { id: 'findings', label: 'Findings' },
  { id: 'categories', label: 'Categories' },
  { id: 'competitors', label: 'Competitors' },
  { id: 'crawl', label: 'Crawl' },
];

export default function Home() {
  const [url, setUrl] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [competitorUrls, setCompetitorUrls] = useState('');
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState({ step: '', percent: 0 });
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [report, setReport] = useState(null);
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState('overview');
  const [severityFilter, setSeverityFilter] = useState('all');
  const [planUnlocked, setPlanUnlocked] = useState(false);

  const audit = report?.audit;
  const primary = audit?.primary;
  const categoryDetails = primary?.categoryDetails || {};
  const findings = primary?.findings || [];
  const competitorComparison = audit?.competitorComparison || [];
  const topFindings = findings.slice(0, 5);
  const reportTabs = useMemo(
    () => (planUnlocked ? [...tabs, { id: 'plan', label: 'Action Plan' }] : tabs),
    [planUnlocked]
  );
  const actionPlan = useMemo(
    () => buildActionPlan(report, primary, categoryDetails, findings),
    [report, primary, categoryDetails, findings]
  );

  const filteredFindings = useMemo(() => {
    if (severityFilter === 'all') return findings;
    return findings.filter((finding) => finding.severity === severityFilter);
  }, [findings, severityFilter]);

  const scoreCards = [
    { label: 'Overall', value: report?.scores?.overall, caption: 'Diagnostic score' },
    { label: 'GEO / AEO', value: report?.scores?.aeoGeo, caption: 'AI answer readiness' },
    { label: 'AI Readiness', value: report?.scores?.aiReadiness, caption: 'Entity and crawler signals' },
    { label: 'SEO', value: report?.scores?.seo, caption: 'Technical foundation' },
    { label: 'Mobile', value: report?.scores?.mobile, caption: 'PageSpeed mobile' },
    { label: 'Security', value: report?.scores?.security, caption: 'Header baseline' },
  ];

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setReport(null);
    setActiveTab('overview');
    setPlanUnlocked(false);
    setElapsedSeconds(0);
    setProgress({ step: 'Preparing audit scope...', percent: 3 });

    const startedAt = Date.now();
    const elapsedInterval = setInterval(() => {
      setElapsedSeconds(Math.round((Date.now() - startedAt) / 1000));
    }, 1000);

    let requestTimeout;
    try {
      const controller = new AbortController();
      requestTimeout = setTimeout(() => controller.abort(), 330000);
      const response = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          url,
          companyName,
          competitorUrls,
          maxPages: 250,
          maxDurationMs: 150000,
          maxCompetitorPages: 25,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || 'Failed to generate report');
      }

      const data = await readAuditStream(response, (progressUpdate) => {
        setProgress((previous) => ({
          step: progressUpdate.step,
          percent: Math.max(previous.percent, progressUpdate.percent),
        }));
      });

      setReport(data);
      setProgress({ step: 'Complete', percent: 100 });
    } catch (err) {
      setError(err.name === 'AbortError'
        ? 'The audit timed out after 5.5 minutes. Try fewer competitor URLs or rerun the site.'
        : err.message);
    } finally {
      clearInterval(elapsedInterval);
      clearTimeout(requestTimeout);
      setLoading(false);
    }
  };

  const downloadPDF = async () => {
    if (!report) return;

    const printWindow = window.open('', '_blank');
    printWindow.document.write(report.html);
    printWindow.document.close();

    setTimeout(() => {
      printWindow.print();
    }, 1000);
  };

  const downloadHTML = () => {
    if (!report) return;

    const blob = new Blob([report.html], { type: 'text/html' });
    const reportUrl = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = reportUrl;
    a.download = `${(companyName || primary?.domain || 'audit').replace(/\s+/g, '_')}_Report.html`;
    a.click();
    URL.revokeObjectURL(reportUrl);
  };

  const resetReport = () => {
    setReport(null);
    setUrl('');
    setCompanyName('');
    setCompetitorUrls('');
    setSeverityFilter('all');
    setActiveTab('overview');
    setPlanUnlocked(false);
  };

  const openActionPlan = () => {
    setPlanUnlocked(true);
    setActiveTab('plan');
  };

  return (
    <main className="min-h-screen bg-[#f4f7fb] text-slate-950">
      {!report ? (
        <div className="mx-auto flex min-h-screen max-w-5xl flex-col justify-center px-5 py-10">
          <div className="mb-10">
            <div className="text-xs font-semibold uppercase tracking-[0.28em] text-slate-500">Second Crew</div>
            <h1 className="mt-4 max-w-3xl text-4xl font-semibold tracking-normal text-slate-950 md:text-5xl">
              GEO / AEO diagnostic workspace
            </h1>
            <p className="mt-4 max-w-2xl text-base leading-7 text-slate-600">
              Crawl the site, collect evidence, compare manual competitors, and generate a paid-diagnostic style report.
            </p>
          </div>

          <section className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm md:p-8">
            <form onSubmit={handleSubmit} className="space-y-6">
              <div>
                <label className="mb-2 block text-sm font-medium text-slate-700">Website URL</label>
                <input
                  type="text"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  placeholder="example.com"
                  required
                  className="w-full rounded-md border border-slate-300 bg-white px-4 py-3 text-slate-950 placeholder-slate-400 outline-none transition focus:border-cyan-500 focus:ring-4 focus:ring-cyan-100"
                />
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-slate-700">Company Name</label>
                <input
                  type="text"
                  value={companyName}
                  onChange={(e) => setCompanyName(e.target.value)}
                  placeholder="Acme Corp"
                  className="w-full rounded-md border border-slate-300 bg-white px-4 py-3 text-slate-950 placeholder-slate-400 outline-none transition focus:border-cyan-500 focus:ring-4 focus:ring-cyan-100"
                />
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-slate-700">Manual Competitor URLs</label>
                <textarea
                  value={competitorUrls}
                  onChange={(e) => setCompetitorUrls(e.target.value)}
                  placeholder={'competitor-one.com\nhttps://competitor-two.com'}
                  rows={4}
                  className="w-full rounded-md border border-slate-300 bg-white px-4 py-3 text-slate-950 placeholder-slate-400 outline-none transition focus:border-cyan-500 focus:ring-4 focus:ring-cyan-100"
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className="flex w-full items-center justify-center rounded-md bg-slate-950 px-5 py-4 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {loading ? 'Analyzing...' : 'Run Diagnostic'}
              </button>
            </form>

            {loading && (
              <div className="mt-8">
                <div className="mb-2 flex justify-between text-sm text-slate-600">
                  <span>{progress.step}</span>
                  <span>{progress.percent}%</span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                  <div
                    className="h-full rounded-full bg-cyan-500 transition-all duration-500"
                    style={{ width: `${progress.percent}%` }}
                  />
                </div>
                <div className="mt-3 flex flex-col gap-1 text-sm text-slate-500 md:flex-row md:items-center md:justify-between">
                  <span>Elapsed: {formatElapsed(elapsedSeconds)}</span>
                  <span>Large sites and competitor crawls can take 2-5 minutes.</span>
                </div>
              </div>
            )}

            {error && (
              <div className="mt-6 rounded-md border border-red-200 bg-red-50 p-4">
                <p className="text-sm font-medium text-red-700">{error}</p>
              </div>
            )}
          </section>

          <div className="mt-8 text-sm text-slate-500">Powered by Second Crew</div>
        </div>
      ) : (
        <div className="min-h-screen">
          <header className="border-b border-slate-200 bg-white">
            <div className="mx-auto max-w-7xl px-5 py-5">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <div className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">Second Crew Diagnostic</div>
                  <h1 className="mt-2 text-3xl font-semibold tracking-normal text-slate-950">
                    {companyName || primary?.domain || 'Website audit'}
                  </h1>
                  <p className="mt-1 text-sm text-slate-500">
                    {primary?.startUrl} · {primary?.pageCount || 0} pages crawled · {audit?.elapsedMs ? `${Math.round(audit.elapsedMs / 1000)}s runtime` : 'Runtime unavailable'}
                  </p>
                </div>

                <div className="flex flex-wrap gap-3">
                  <button onClick={downloadPDF} className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-800 transition hover:bg-slate-50">
                    Print PDF
                  </button>
                  <button onClick={downloadHTML} className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-800 transition hover:bg-slate-50">
                    Download HTML
                  </button>
                  <button onClick={resetReport} className="rounded-md bg-slate-950 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800">
                    New Audit
                  </button>
                </div>
              </div>
            </div>
          </header>

          <div className="sticky top-0 z-20 border-b border-slate-200 bg-white/95 backdrop-blur">
            <div className="mx-auto flex max-w-7xl gap-2 overflow-x-auto px-5 py-3">
              {reportTabs.map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`whitespace-nowrap rounded-md px-4 py-2 text-sm font-semibold transition ${
                    activeTab === tab.id
                      ? 'bg-slate-950 text-white'
                      : 'text-slate-600 hover:bg-slate-100 hover:text-slate-950'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>

          <div className="mx-auto max-w-7xl px-5 py-6">
            {activeTab === 'overview' && (
              <div className="space-y-6">
                <section className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-6">
                  {scoreCards.map((card) => (
                    <ScoreCard key={card.label} {...card} />
                  ))}
                </section>

                <section className="grid grid-cols-1 gap-5 xl:grid-cols-[1.2fr_0.8fr]">
                  <div className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
                    <div className="mb-4 flex items-start justify-between gap-4">
                      <div>
                        <h2 className="text-xl font-semibold text-slate-950">Executive Summary</h2>
                        <p className="mt-1 text-sm text-slate-500">Evidence-backed readiness, not a live ranking guarantee.</p>
                      </div>
                      <StatusPill score={report?.scores?.aeoGeo} />
                    </div>
                    <p className="text-base leading-7 text-slate-700">{report.aiInsights?.executiveSummary}</p>
                    <div className="mt-5 grid grid-cols-1 gap-3 md:grid-cols-3">
                      <Metric label="Sitemap URLs" value={primary?.crawl?.auxiliary?.sitemap?.urlCount ?? 0} />
                      <Metric label="Schema Types" value={primary?.schema?.types?.length ?? 0} />
                      <Metric label="Findings" value={findings.length} />
                    </div>
                  </div>

                  <div className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
                    <h2 className="text-xl font-semibold text-slate-950">Top Priorities</h2>
                    <div className="mt-4 space-y-3">
                      {topFindings.length ? topFindings.map((finding) => (
                        <button
                          key={finding.id}
                          onClick={() => {
                            setSeverityFilter(finding.severity);
                            setActiveTab('findings');
                          }}
                          className="w-full rounded-md border border-slate-200 p-4 text-left transition hover:border-cyan-300 hover:bg-cyan-50"
                        >
                          <div className="flex items-center justify-between gap-3">
                            <div className="min-w-0 font-semibold text-slate-900">{finding.title}</div>
                            <SeverityBadge severity={finding.severity} />
                          </div>
                          <p className="mt-2 line-clamp-2 text-sm leading-6 text-slate-600">{finding.description}</p>
                        </button>
                      )) : (
                        <p className="text-sm text-slate-500">No prioritized findings returned.</p>
                      )}
                    </div>
                  </div>
                </section>

                <section className="grid grid-cols-1 gap-4 lg:grid-cols-3">
                  <SignalPanel title="AI Bot Access" items={botAccessItems(report)} />
                  <SignalPanel title="Content Signals" items={contentSignalItems(primary)} />
                  <SignalPanel title="LLM Narrative" items={llmItems(report)} />
                </section>

                <section className="grid grid-cols-1 gap-5 xl:grid-cols-[0.9fr_1.1fr]">
                  <div className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
                    <h2 className="text-xl font-semibold text-slate-950">Score Narrative</h2>
                    <div className="mt-4 space-y-3">
                      {(report.aiInsights?.scoreNarrative || []).map((item) => (
                        <div key={`${item.label}-${item.score}`} className="rounded-md border border-slate-200 bg-slate-50 p-4">
                          <div className="flex items-center justify-between gap-4">
                            <div className="font-semibold text-slate-950">{item.label}</div>
                            <div className={`text-lg font-semibold ${getScoreTone(item.score).text}`}>{formatScore(item.score)}</div>
                          </div>
                          <p className="mt-2 text-sm leading-6 text-slate-600">{item.explanation}</p>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
                    <h2 className="text-xl font-semibold text-slate-950">Recommended Roadmap</h2>
                    <div className="mt-4 space-y-3">
                      {(report.aiInsights?.roadmap || []).map((item) => (
                        <div key={`${item.phase}-${item.title}`} className="rounded-md border border-cyan-100 bg-cyan-50 p-4">
                          <div className="text-xs font-semibold uppercase tracking-[0.14em] text-cyan-700">{item.phase}</div>
                          <div className="mt-1 font-semibold text-slate-950">{item.title}</div>
                          <ul className="mt-3 list-disc space-y-1 pl-5 text-sm leading-6 text-slate-700">
                            {(item.actions || []).map((action) => (
                              <li key={action}>{action}</li>
                            ))}
                          </ul>
                        </div>
                      ))}
                    </div>
                  </div>
                </section>
              </div>
            )}

            {activeTab === 'findings' && (
              <section className="space-y-4">
                <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                  <div>
                    <h2 className="text-2xl font-semibold text-slate-950">Prioritized Findings</h2>
                    <p className="mt-1 text-sm text-slate-500">Each item includes evidence, confidence, and a recommended fix.</p>
                  </div>
                  <div className="flex gap-2">
                    {['all', 'high', 'medium', 'low'].map((severity) => (
                      <button
                        key={severity}
                        onClick={() => setSeverityFilter(severity)}
                        className={`rounded-md px-3 py-2 text-sm font-semibold capitalize transition ${
                          severityFilter === severity
                            ? 'bg-slate-950 text-white'
                            : 'border border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
                        }`}
                      >
                        {severity}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-4">
                  {filteredFindings.map((finding) => (
                    <FindingCard key={finding.id} finding={finding} />
                  ))}
                  {!filteredFindings.length && (
                    <div className="rounded-lg border border-slate-200 bg-white p-6 text-sm text-slate-500">No findings match this filter.</div>
                  )}
                </div>
              </section>
            )}

            {activeTab === 'categories' && (
              <section className="space-y-4">
                <div>
                  <h2 className="text-2xl font-semibold text-slate-950">Category Breakdown</h2>
                  <p className="mt-1 text-sm text-slate-500">Open each category to inspect passed, partial, failed, and unknown checks.</p>
                </div>
                <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
                  {Object.values(categoryDetails).map((category) => (
                    <CategoryPanel key={category.name} category={category} />
                  ))}
                </div>
              </section>
            )}

            {activeTab === 'competitors' && (
              <section className="space-y-4">
                <div>
                  <h2 className="text-2xl font-semibold text-slate-950">Manual Competitor Comparison</h2>
                  <p className="mt-1 text-sm text-slate-500">Phase 1 compares manually submitted competitors without paid SERP APIs.</p>
                </div>
                {competitorComparison.length ? (
                  <div className="grid grid-cols-1 gap-4">
                    {competitorComparison.map((competitor) => (
                      <CompetitorCard key={competitor.domain} competitor={competitor} />
                    ))}
                  </div>
                ) : (
                  <div className="rounded-lg border border-slate-200 bg-white p-8 text-center text-slate-500">
                    No competitors were submitted for this audit.
                  </div>
                )}
              </section>
            )}

            {activeTab === 'crawl' && (
              <section className="space-y-4">
                <div>
                  <h2 className="text-2xl font-semibold text-slate-950">Crawl Coverage</h2>
                  <p className="mt-1 text-sm text-slate-500">Coverage, discovered page types, and PageSpeed availability.</p>
                </div>
                <div className="grid grid-cols-1 gap-4 lg:grid-cols-4">
                  <MetricCard label="Pages Crawled" value={primary?.pageCount || 0} />
                  <MetricCard label="Stopped By" value={primary?.crawl?.summary?.stoppedBy || 'unknown'} />
                  <MetricCard label="PageSpeed" value={audit?.pageSpeed?.available ? 'available' : 'unavailable'} />
                  <MetricCard label="Supabase" value={report.persistence?.status || 'skipped'} />
                </div>
                <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                  <UrlList title="FAQ Pages" urls={primary?.content?.faqPages || []} />
                  <UrlList title="Service Pages" urls={primary?.content?.servicePages || []} />
                  <UrlList title="Product Pages" urls={primary?.content?.productPages || []} />
                  <UrlList title="Comparison Pages" urls={primary?.content?.comparisonPages || []} />
                </div>
              </section>
            )}

            {activeTab === 'plan' && (
              <ActionPlanView
                plan={actionPlan}
                primary={primary}
                onOpenFindings={() => setActiveTab('findings')}
              />
            )}

            {activeTab !== 'plan' && (
              <PlanUnlockCta plan={actionPlan} onOpen={openActionPlan} unlocked={planUnlocked} />
            )}
          </div>
        </div>
      )}
    </main>
  );
}

async function readAuditStream(response, onProgress) {
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let result = null;
  let crawlContext = { maxPages: 250 };

  const handleLine = (line) => {
    if (!line.trim()) return;
    let event;
    try {
      event = JSON.parse(line);
    } catch {
      return;
    }

    if (event.type === 'error') throw new Error(event.error || 'Failed to generate report');
    if (event.type === 'result') {
      result = event.data;
      return;
    }
    if (event.type === 'progress') {
      onProgress(describeProgressEvent(event, crawlContext));
    }
  };

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    const lines = buffer.split('\n');
    buffer = lines.pop();
    for (const line of lines) handleLine(line);
  }
  handleLine(buffer);

  if (!result) throw new Error('The audit stream ended without a result. Try running the audit again.');
  return result;
}

function describeProgressEvent(event, crawlContext) {
  switch (event.stage) {
    case 'start':
      crawlContext.maxPages = event.maxPages || 250;
      return { step: 'Preparing audit scope...', percent: 4 };
    case 'crawl': {
      const seen = (event.crawled || 0) + (event.queued || 0);
      const fraction = seen > 0 ? (event.crawled || 0) / Math.min(Math.max(seen, 1), crawlContext.maxPages) : 0;
      return {
        step: `Crawling site pages... ${event.crawled || 0} crawled`,
        percent: 5 + Math.round(Math.min(1, fraction) * 55),
      };
    }
    case 'crawl_done':
      return { step: `Crawl complete: ${event.crawled} pages`, percent: 62 };
    case 'pagespeed_done':
      return { step: 'PageSpeed checks finished', percent: 30 };
    case 'competitor':
      return {
        step: `Crawling competitor ${event.index} of ${event.total}...`,
        percent: 62 + Math.round((event.index / Math.max(event.total, 1)) * 10),
      };
    case 'scoring':
      return { step: 'Scoring technical and authority signals...', percent: 78 };
    case 'llm':
      return { step: 'Generating evidence-grounded narrative...', percent: 84 };
    case 'report':
      return { step: 'Assembling report workspace...', percent: 92 };
    case 'persist':
      return { step: 'Saving audit history...', percent: 96 };
    default:
      return { step: 'Working...', percent: 5 };
  }
}

function PlanUnlockCta({ plan, onOpen, unlocked }) {
  return (
    <section className="mt-8 rounded-lg border border-slate-800 bg-slate-950 p-6 text-white shadow-sm md:p-7">
      <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <div className="text-xs font-semibold uppercase tracking-[0.18em] text-cyan-300">Execution workspace</div>
          <h2 className="mt-2 text-2xl font-semibold tracking-normal">Your Plan is Ready</h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-300">
            Open a prioritized execution plan with general score-lift work, category fixes, and page-by-page tasks based on this crawl.
          </p>
        </div>
        <div className="grid grid-cols-3 gap-3 lg:min-w-[360px]">
          <div className="rounded-md border border-slate-700 bg-slate-900 p-3">
            <div className="text-xl font-semibold">{plan.totalTasks}</div>
            <div className="mt-1 text-xs text-slate-400">Tasks</div>
          </div>
          <div className="rounded-md border border-slate-700 bg-slate-900 p-3">
            <div className="text-xl font-semibold">{plan.pagePlans.length}</div>
            <div className="mt-1 text-xs text-slate-400">Pages</div>
          </div>
          <div className="rounded-md border border-slate-700 bg-slate-900 p-3">
            <div className="text-xl font-semibold">{plan.highImpactTasks}</div>
            <div className="mt-1 text-xs text-slate-400">High impact</div>
          </div>
        </div>
      </div>
      <button
        type="button"
        onClick={onOpen}
        className="mt-6 w-full rounded-md bg-cyan-400 px-5 py-4 text-sm font-semibold text-slate-950 transition hover:bg-cyan-300 md:w-auto"
      >
        {unlocked ? 'Open Action Plan' : 'Your plan is Ready'}
      </button>
    </section>
  );
}

function ActionPlanView({ plan, primary, onOpenFindings }) {
  return (
    <section className="space-y-6">
      <div className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm md:p-7">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div className="text-xs font-semibold uppercase tracking-[0.18em] text-cyan-700">Execution plan</div>
            <h2 className="mt-2 text-3xl font-semibold tracking-normal text-slate-950">Page-by-page score lift plan</h2>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-600">
              Work top to bottom: fix high-impact sitewide signals first, then improve the highest-risk pages with clearer answers, schema, metadata, and trust proof.
            </p>
          </div>
          <button
            type="button"
            onClick={onOpenFindings}
            className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-800 transition hover:bg-slate-50"
          >
            Review Findings
          </button>
        </div>

        <div className="mt-6 grid grid-cols-1 gap-3 md:grid-cols-4">
          <Metric label="Total Tasks" value={plan.totalTasks} />
          <Metric label="High Impact" value={plan.highImpactTasks} />
          <Metric label="Pages With Work" value={plan.pagePlans.length} />
          <Metric label="Pages Crawled" value={primary?.pageCount || 0} />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
        <PlanSection
          title="General Score-Lift Plan"
          description="These are the sitewide moves most likely to raise GEO/AEO readiness across ChatGPT Search, Google AI Overviews, and other answer engines."
          tasks={plan.generalTasks}
          empty="No sitewide tasks were generated from this audit."
        />
        <PlanSection
          title="Category Fixes"
          description="These tasks come directly from failed, partial, or unknown scoring checks."
          tasks={plan.categoryTasks}
          empty="All category checks passed."
        />
      </div>

      <section className="space-y-4">
        <div>
          <h2 className="text-2xl font-semibold text-slate-950">Page-by-Page Execution</h2>
          <p className="mt-1 text-sm text-slate-500">
            The highest-priority pages are listed first. Use the checkboxes as a lightweight execution tracker during implementation.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-4">
          {plan.pagePlans.length ? plan.pagePlans.map((pagePlan, index) => (
            <PagePlanCard key={pagePlan.url} pagePlan={pagePlan} defaultOpen={index < 4} />
          )) : (
            <div className="rounded-lg border border-slate-200 bg-white p-6 text-sm text-slate-500">
              No page-specific tasks were generated. Focus on the sitewide and category work above.
            </div>
          )}
        </div>
      </section>
    </section>
  );
}

function PlanSection({ title, description, tasks, empty }) {
  return (
    <section className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
      <h3 className="text-xl font-semibold text-slate-950">{title}</h3>
      <p className="mt-2 text-sm leading-6 text-slate-500">{description}</p>
      <TaskList tasks={tasks} empty={empty} />
    </section>
  );
}

function TaskList({ tasks, empty }) {
  return (
    <div className="mt-5 space-y-3">
      {tasks.length ? tasks.map((task) => (
        <label key={task.id} className="flex gap-3 rounded-md border border-slate-200 bg-slate-50 p-4">
          <input type="checkbox" className="mt-1 h-4 w-4 rounded border-slate-300 text-cyan-600 focus:ring-cyan-500" />
          <span className="min-w-0">
            <span className="flex flex-wrap items-center gap-2">
              <span className="font-semibold text-slate-950">{task.title}</span>
              <PlanImpactBadge impact={task.impact} />
              {task.effort && <span className="rounded-full bg-white px-2.5 py-1 text-xs font-semibold text-slate-600">{task.effort}</span>}
            </span>
            <span className="mt-2 block text-sm leading-6 text-slate-600">{task.detail}</span>
            {task.evidence && <span className="mt-2 block break-words text-xs leading-5 text-slate-500">Evidence: {task.evidence}</span>}
            {task.source && <span className="mt-2 block text-xs font-semibold uppercase tracking-[0.12em] text-slate-400">{task.source}</span>}
          </span>
        </label>
      )) : (
        <p className="rounded-md border border-slate-200 bg-slate-50 p-4 text-sm text-slate-500">{empty}</p>
      )}
    </div>
  );
}

function PagePlanCard({ pagePlan, defaultOpen }) {
  return (
    <details className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm" open={defaultOpen}>
      <summary className="cursor-pointer list-none">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold capitalize text-slate-600">{pagePlan.contentType}</span>
              <PlanImpactBadge impact={pagePlan.priority} />
              <span className="rounded-full bg-cyan-50 px-2.5 py-1 text-xs font-semibold text-cyan-700">{pagePlan.tasks.length} tasks</span>
            </div>
            <h3 className="mt-3 break-words text-lg font-semibold text-slate-950">{pagePlan.title}</h3>
            <a href={pagePlan.url} target="_blank" rel="noreferrer" className="mt-2 block break-words text-sm font-medium text-cyan-700 hover:text-cyan-900">
              {pagePlan.url}
            </a>
          </div>
          <div className={`rounded-md px-4 py-3 text-center ${getScoreTone(pagePlan.readiness).pill}`}>
            <div className="text-2xl font-semibold">{pagePlan.readiness}</div>
            <div className="text-xs font-semibold">Page readiness</div>
          </div>
        </div>
      </summary>

      <div className="mt-5 grid grid-cols-2 gap-3 md:grid-cols-5">
        <Metric label="Words" value={pagePlan.wordCount} />
        <Metric label="Schema" value={pagePlan.schemaCount} />
        <Metric label="H1 Count" value={pagePlan.h1Count} />
        <Metric label="FAQ" value={pagePlan.hasVisibleFaq ? 'Yes' : 'No'} />
        <Metric label="Indexable" value={pagePlan.indexable ? 'Yes' : 'No'} />
      </div>

      <TaskList tasks={pagePlan.tasks} empty="No tasks for this page." />
    </details>
  );
}

function PlanImpactBadge({ impact }) {
  const classes = {
    High: 'bg-red-100 text-red-700',
    Medium: 'bg-amber-100 text-amber-700',
    Low: 'bg-sky-100 text-sky-700',
  };

  return <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${classes[impact] || classes.Medium}`}>{impact}</span>;
}

function ScoreCard({ label, value, caption }) {
  const tone = getScoreTone(value);

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <div className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">{label}</div>
      <div className={`mt-3 text-4xl font-semibold ${tone.text}`}>{formatScore(value)}</div>
      <div className="mt-2 text-sm text-slate-500">{caption}</div>
      <div className="mt-4 h-2 overflow-hidden rounded-full bg-slate-100">
        <div className={`h-full rounded-full ${tone.bar}`} style={{ width: `${value == null ? 0 : Math.max(0, Math.min(100, value))}%` }} />
      </div>
    </div>
  );
}

function StatusPill({ score }) {
  const tone = getScoreTone(score);
  const label = score >= 80 ? 'Strong' : score >= 60 ? 'Developing' : 'Needs Work';

  return <span className={`rounded-full px-3 py-1 text-xs font-semibold ${tone.pill}`}>{label}</span>;
}

function Metric({ label, value }) {
  return (
    <div className="rounded-md border border-slate-200 bg-slate-50 p-4">
      <div className="text-2xl font-semibold text-slate-950">{value}</div>
      <div className="mt-1 text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">{label}</div>
    </div>
  );
}

function MetricCard({ label, value }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
      <div className="text-sm font-medium text-slate-500">{label}</div>
      <div className="mt-2 break-words text-2xl font-semibold text-slate-950">{value}</div>
    </div>
  );
}

function SignalPanel({ title, items }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
      <h3 className="text-lg font-semibold text-slate-950">{title}</h3>
      <div className="mt-4 space-y-3">
        {items.map((item) => (
          <div key={item.label} className="flex items-center justify-between gap-3 border-b border-slate-100 pb-3 last:border-0 last:pb-0">
            <div className="text-sm text-slate-600">{item.label}</div>
            <div className={`text-sm font-semibold ${item.ok ? 'text-emerald-700' : 'text-amber-700'}`}>{item.value}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function FindingCard({ finding }) {
  return (
    <article className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <SeverityBadge severity={finding.severity} />
            <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600">{finding.category}</span>
            <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600">Confidence: {finding.confidence}</span>
          </div>
          <h3 className="mt-3 text-lg font-semibold text-slate-950">{finding.title}</h3>
          <p className="mt-2 text-sm leading-6 text-slate-600">{finding.description}</p>
        </div>
        <div className="rounded-md bg-slate-50 px-3 py-2 text-sm font-semibold text-slate-700">Impact {finding.scoreImpact}</div>
      </div>
      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="rounded-md border border-slate-200 bg-slate-50 p-4">
          <div className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Evidence</div>
          <p className="mt-2 break-words text-sm leading-6 text-slate-700">{finding.evidence || 'No evidence provided'}</p>
          {finding.url && (
            <a href={finding.url} target="_blank" rel="noreferrer" className="mt-3 block break-words text-sm font-medium text-cyan-700 hover:text-cyan-900">
              {finding.url}
            </a>
          )}
        </div>
        <div className="rounded-md border border-cyan-100 bg-cyan-50 p-4">
          <div className="text-xs font-semibold uppercase tracking-[0.12em] text-cyan-700">Recommendation</div>
          <p className="mt-2 text-sm leading-6 text-slate-700">{finding.recommendation}</p>
        </div>
      </div>
    </article>
  );
}

function CategoryPanel({ category }) {
  return (
    <details className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm" open={category.score < 80}>
      <summary className="cursor-pointer list-none">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h3 className="text-lg font-semibold text-slate-950">{category.name}</h3>
            <p className="mt-1 text-sm text-slate-500">{category.points}/{category.maxPoints} points</p>
          </div>
          <div className={`text-3xl font-semibold ${getScoreTone(category.score).text}`}>{category.score}</div>
        </div>
      </summary>
      <div className="mt-5 overflow-hidden rounded-md border border-slate-200">
        <table className="w-full border-collapse text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase tracking-[0.12em] text-slate-500">
            <tr>
              <th className="px-4 py-3 font-semibold">Check</th>
              <th className="px-4 py-3 font-semibold">Status</th>
              <th className="px-4 py-3 font-semibold">Evidence</th>
            </tr>
          </thead>
          <tbody>
            {category.checks.map((check) => (
              <tr key={`${category.name}-${check.label}`} className="border-t border-slate-200">
                <td className="px-4 py-3 font-medium text-slate-800">{check.label}</td>
                <td className="px-4 py-3"><CheckStatus status={check.status} score={check.score} maxScore={check.maxScore} /></td>
                <td className="px-4 py-3 text-slate-600">{check.evidence}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}

function CompetitorCard({ competitor }) {
  return (
    <article className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h3 className="text-lg font-semibold text-slate-950">{competitor.name}</h3>
          <p className="mt-1 text-sm text-slate-500">{competitor.domain} · {competitor.crawledPages} pages crawled</p>
        </div>
        <div className="grid grid-cols-3 gap-3">
          <Metric label="GEO / AEO" value={competitor.scores?.aeoGeo ?? 'N/A'} />
          <Metric label="Overall" value={competitor.scores?.overall ?? 'N/A'} />
          <Metric label="Diff" value={`${competitor.scoreDiff > 0 ? '+' : ''}${competitor.scoreDiff}`} />
        </div>
      </div>
      <div className="mt-5 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <TextList title="Gaps" items={competitor.gaps} empty="No major gaps detected." />
        <TextList title="Advantages" items={competitor.advantages} empty="No major advantages detected." />
      </div>
    </article>
  );
}

function UrlList({ title, urls }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
      <h3 className="text-lg font-semibold text-slate-950">{title}</h3>
      <div className="mt-4 space-y-2">
        {urls.length ? urls.slice(0, 12).map((pageUrl) => (
          <a key={pageUrl} href={pageUrl} target="_blank" rel="noreferrer" className="block break-words rounded-md border border-slate-200 px-3 py-2 text-sm text-cyan-700 hover:border-cyan-300 hover:bg-cyan-50">
            {pageUrl}
          </a>
        )) : (
          <p className="text-sm text-slate-500">No pages detected.</p>
        )}
      </div>
    </div>
  );
}

function TextList({ title, items, empty }) {
  return (
    <div className="rounded-md border border-slate-200 bg-slate-50 p-4">
      <div className="text-sm font-semibold text-slate-950">{title}</div>
      <div className="mt-3 space-y-2">
        {items?.length ? items.map((item) => (
          <div key={item} className="rounded-md bg-white px-3 py-2 text-sm leading-6 text-slate-700">{item}</div>
        )) : (
          <p className="text-sm text-slate-500">{empty}</p>
        )}
      </div>
    </div>
  );
}

function SeverityBadge({ severity }) {
  const classes = {
    high: 'bg-red-100 text-red-700',
    medium: 'bg-amber-100 text-amber-700',
    low: 'bg-sky-100 text-sky-700',
  };

  return <span className={`rounded-full px-2.5 py-1 text-xs font-semibold capitalize ${classes[severity] || 'bg-slate-100 text-slate-700'}`}>{severity}</span>;
}

function CheckStatus({ status, score, maxScore }) {
  const classes = {
    passed: 'text-emerald-700 bg-emerald-50',
    partial: 'text-amber-700 bg-amber-50',
    unknown: 'text-slate-700 bg-slate-100',
    failed: 'text-red-700 bg-red-50',
  };

  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold capitalize ${classes[status] || classes.failed}`}>
      {status} · {score}/{maxScore}
    </span>
  );
}

function botAccessItems(report) {
  const access = report?.aiReadiness?.features?.aiBotAccess || {};
  return ['Googlebot', 'OAI-SearchBot', 'ChatGPT-User', 'PerplexityBot', 'ClaudeBot'].map((bot) => ({
    label: bot,
    value: access[bot]?.allowed === false ? 'Blocked' : 'Allowed',
    ok: access[bot]?.allowed !== false,
  }));
}

function contentSignalItems(primary) {
  return [
    { label: 'FAQ pages', value: primary?.content?.faqPages?.length ?? 0, ok: (primary?.content?.faqPages?.length ?? 0) > 0 },
    { label: 'Service pages', value: primary?.content?.servicePages?.length ?? 0, ok: (primary?.content?.servicePages?.length ?? 0) > 0 },
    { label: 'Product pages', value: primary?.content?.productPages?.length ?? 0, ok: (primary?.content?.productPages?.length ?? 0) > 0 },
    { label: 'Comparison pages', value: primary?.content?.comparisonPages?.length ?? 0, ok: (primary?.content?.comparisonPages?.length ?? 0) > 0 },
  ];
}

function persistenceItems(report) {
  const persistence = report?.persistence || {};
  return [
    { label: 'Status', value: persistence.status || 'skipped', ok: persistence.status === 'saved' },
    { label: 'Client ID', value: persistence.clientId || 'not stored', ok: Boolean(persistence.clientId) },
    { label: 'Audit ID', value: persistence.auditId || 'not stored', ok: Boolean(persistence.auditId) },
  ];
}

function llmItems(report) {
  const llm = report?.llm || {};
  return [
    { label: 'Provider', value: llm.provider || 'none', ok: llm.status === 'generated' },
    { label: 'Model', value: llm.model || 'not configured', ok: llm.status === 'generated' },
    { label: 'Status', value: llm.status || 'skipped', ok: llm.status === 'generated' },
  ];
}

function buildActionPlan(report, primary, categoryDetails, findings) {
  const generalTasks = buildGeneralTasks(report, findings);
  const categoryTasks = buildCategoryTasks(categoryDetails);
  const pagePlans = buildPagePlans(primary?.pages || []);
  const pageTasks = pagePlans.flatMap((page) => page.tasks);
  const allTasks = [...generalTasks, ...categoryTasks, ...pageTasks];

  return {
    generalTasks,
    categoryTasks,
    pagePlans,
    totalTasks: allTasks.length,
    highImpactTasks: allTasks.filter((task) => task.impact === 'High').length,
  };
}

function buildGeneralTasks(report, findings) {
  const tasks = [];
  const roadmap = Array.isArray(report?.aiInsights?.roadmap) ? report.aiInsights.roadmap : [];

  findings.slice(0, 8).forEach((finding, index) => {
    tasks.push({
      id: `finding-${finding.id || index}`,
      title: finding.title || 'Resolve prioritized finding',
      detail: finding.recommendation || finding.description || 'Address the finding documented in the diagnostic.',
      evidence: finding.evidence,
      impact: finding.severity === 'high' ? 'High' : finding.severity === 'low' ? 'Low' : 'Medium',
      effort: finding.severity === 'high' ? 'This week' : 'Next sprint',
      source: finding.category,
    });
  });

  roadmap.forEach((phase, phaseIndex) => {
    (phase.actions || []).forEach((action, actionIndex) => {
      tasks.push({
        id: `roadmap-${phaseIndex}-${actionIndex}`,
        title: phase.title || phase.phase || 'Roadmap action',
        detail: action,
        evidence: '',
        impact: phaseIndex === 0 ? 'High' : phaseIndex === 1 ? 'Medium' : 'Low',
        effort: phase.phase || `Phase ${phaseIndex + 1}`,
        source: 'Recommended Roadmap',
      });
    });
  });

  if (!tasks.length && report) {
    tasks.push({
      id: 'general-maintain',
      title: 'Maintain score momentum',
      detail: 'Review the category breakdown, keep high-performing pages current, and rerun this diagnostic after each content or technical release.',
      evidence: '',
      impact: 'Medium',
      effort: 'Ongoing',
      source: 'Diagnostic',
    });
  }

  return dedupeTasks(tasks).slice(0, 14);
}

function buildCategoryTasks(categoryDetails) {
  return Object.values(categoryDetails || {})
    .flatMap((category) => (category.checks || [])
      .filter((check) => check.status !== 'passed')
      .map((check, index) => ({
        id: `category-${slugify(category.name)}-${index}-${slugify(check.label)}`,
        title: check.label,
        detail: recommendActionForCheck(check.label, category.name),
        evidence: check.evidence,
        impact: categoryImpact(check, category),
        effort: check.maxScore >= 16 ? '1-2 days' : '2-4 hours',
        source: category.name,
      })))
    .sort((a, b) => impactWeight(b.impact) - impactWeight(a.impact))
    .slice(0, 28);
}

function buildPagePlans(pages) {
  if (!Array.isArray(pages)) return [];

  return pages
    .map((page, index) => {
      const tasks = buildPageTasks(page, index);
      const readiness = Math.max(0, Math.min(100, 100 - tasks.reduce((sum, task) => sum + impactPenalty(task.impact), 0)));
      const priority = tasks.some((task) => task.impact === 'High')
        ? 'High'
        : tasks.some((task) => task.impact === 'Medium')
          ? 'Medium'
          : 'Low';

      return {
        url: page.url,
        title: page.title || titleFromUrl(page.url),
        contentType: page.contentType || 'general',
        indexable: page.indexable !== false,
        h1Count: page.h1Count || 0,
        wordCount: page.wordCount || 0,
        hasVisibleFaq: Boolean(page.hasVisibleFaq),
        schemaCount: page.schemaCount || 0,
        tasks,
        readiness,
        priority,
      };
    })
    .filter((page) => page.tasks.length > 0)
    .sort((a, b) => impactWeight(b.priority) - impactWeight(a.priority) || a.readiness - b.readiness || b.tasks.length - a.tasks.length)
    .slice(0, 60);
}

function buildPageTasks(page, index) {
  const tasks = [];
  const utilityPage = isUtilityPage(page.url);
  const contentType = page.contentType || 'general';
  const titleLength = (page.title || '').trim().length;
  const descriptionLength = (page.metaDescription || '').trim().length;
  const wordCount = page.wordCount || 0;
  const h1Count = page.h1Count || 0;

  if (Number(page.status) >= 400) {
    addPageTask(tasks, index, 'status', 'Fix crawlable HTTP status', `Resolve the HTTP ${page.status} response so search and answer engines can reliably access this page.`, 'High', `HTTP ${page.status}`, 'Technical');
  }

  if (page.indexable === false && !utilityPage) {
    addPageTask(tasks, index, 'indexable', 'Make the page indexable', 'Remove accidental noindex directives or canonical conflicts if this page should be eligible for organic and answer-engine visibility.', 'High', page.robotsMeta || 'Page marked not indexable', 'Technical');
  }

  if (!titleLength) {
    addPageTask(tasks, index, 'title-missing', 'Add a unique title tag', 'Write a specific title that names the offering, audience, and brand in natural language.', 'Medium', 'Missing title tag', 'SEO');
  } else if ((titleLength < 28 || titleLength > 70) && !utilityPage) {
    addPageTask(tasks, index, 'title-length', 'Rewrite the title tag', 'Target 35-65 characters with the primary entity, service/product, and brand. Avoid keyword stuffing.', 'Medium', `${titleLength} characters`, 'SEO');
  }

  if (!descriptionLength && !utilityPage) {
    addPageTask(tasks, index, 'description-missing', 'Add a meta description', 'Summarize the page answer, proof point, and next step in one concise paragraph.', 'Medium', 'Missing meta description', 'SEO');
  } else if ((descriptionLength < 70 || descriptionLength > 170) && !utilityPage) {
    addPageTask(tasks, index, 'description-length', 'Tighten the meta description', 'Keep the description in the 90-155 character range and make it answer the page intent clearly.', 'Low', `${descriptionLength} characters`, 'SEO');
  }

  if (h1Count !== 1 && !utilityPage) {
    addPageTask(tasks, index, 'h1', 'Use one descriptive H1', 'Set one visible H1 that matches the page intent and makes the main topic obvious to crawlers and users.', 'Medium', `${h1Count} H1 tags found`, 'Content');
  }

  if (wordCount > 0 && wordCount < 300 && !utilityPage) {
    addPageTask(tasks, index, 'thin-content', 'Expand thin page content', 'Add direct answers, service/product details, eligibility, pricing or quote guidance, process, FAQs, and proof so AI systems have enough extractable context.', 'High', `${wordCount} words`, 'Content');
  }

  if (needsAnswerBlocks(contentType) && !page.hasVisibleFaq && !utilityPage) {
    addPageTask(tasks, index, 'faq', 'Add answer-ready FAQ blocks', 'Add 3-5 concise Q&A sections that answer buyer questions with facts, timelines, cost ranges, comparisons, and next steps.', 'Medium', 'No visible FAQ detected', 'AEO');
  }

  if ((page.schemaCount || 0) === 0 && !utilityPage) {
    addPageTask(tasks, index, 'schema', `Add ${schemaRecommendation(contentType)} schema`, 'Add validated JSON-LD that states the page entity, offering, breadcrumbs, and answer content where relevant.', 'High', 'No JSON-LD schema found on this page', 'Structured Data');
  }

  if ((page.imageCount || 0) > 0 && (page.imagesWithAlt || 0) < page.imageCount) {
    addPageTask(tasks, index, 'alt-text', 'Complete image alt text', 'Write useful alt text for meaningful images and leave decorative images empty only when they are truly decorative.', 'Low', `${page.imagesWithAlt || 0}/${page.imageCount} images have alt text`, 'Accessibility');
  }

  if (contentType === 'contact' && !page.hasPhone && !page.hasEmail) {
    addPageTask(tasks, index, 'contact', 'Add machine-readable contact identity', 'Add visible phone or email details, tel/mailto links, and matching Organization or LocalBusiness schema.', 'High', 'No phone or email detected', 'Entity Trust');
  }

  if (['service', 'product', 'location'].includes(contentType) && wordCount < 700 && !utilityPage) {
    addPageTask(tasks, index, 'commercial-proof', 'Add proof and decision support', 'Add testimonials, use cases, before/after examples, guarantees, reviews, credentials, and clear conversion next steps for this page intent.', 'Medium', `${wordCount} words on a ${contentType} page`, 'Entity Trust');
  }

  return tasks.slice(0, 9);
}

function addPageTask(tasks, pageIndex, key, title, detail, impact, evidence, source) {
  tasks.push({
    id: `page-${pageIndex}-${key}`,
    title,
    detail,
    impact,
    evidence,
    effort: impact === 'High' ? 'Priority fix' : impact === 'Medium' ? 'Standard fix' : 'Polish',
    source,
  });
}

function categoryImpact(check, category) {
  if (check.maxScore >= 16 || category.score < 55 || check.status === 'failed') return 'High';
  if (check.maxScore >= 8 || check.status === 'partial') return 'Medium';
  return 'Low';
}

function recommendActionForCheck(label, categoryName) {
  const text = `${label} ${categoryName}`.toLowerCase();

  if (text.includes('sitemap')) return 'Generate and submit a clean XML sitemap that includes every indexable service, product, category, location, article, and conversion page.';
  if (text.includes('robots') || text.includes('googlebot') || text.includes('oai-searchbot') || text.includes('chatgpt')) return 'Update robots.txt so Googlebot, OAI-SearchBot, ChatGPT-User, PerplexityBot, and ClaudeBot can access public pages meant to rank or be cited.';
  if (text.includes('llms.txt')) return 'Create /llms.txt with a short brand summary, preferred citation URLs, core offerings, important facts, and support/contact paths.';
  if (text.includes('indexable')) return 'Review noindex tags, canonicals, robots rules, and redirects so important pages are indexable and self-canonical where appropriate.';
  if (text.includes('json-ld') || text.includes('schema') || text.includes('structured')) return 'Add validated JSON-LD for Organization, WebSite, BreadcrumbList, and the relevant Service, Product, FAQPage, Article, Review, or LocalBusiness types.';
  if (text.includes('faq') || text.includes('q&a')) return 'Add concise FAQ sections that answer real buyer questions and pair them with FAQPage schema when the content is visible on the page.';
  if (text.includes('direct answer')) return 'Add answer-first blocks under descriptive H2/H3 headings, with one clear answer followed by supporting details and proof.';
  if (text.includes('topical depth')) return 'Create dedicated pages for each major offer, use case, comparison, location, audience, and buyer question instead of relying on one broad page.';
  if (text.includes('dedicated pages')) return 'Map every core offering to its own page with entity-specific copy, FAQs, proof, schema, and internal links.';
  if (text.includes('comparison')) return 'Publish comparison, alternative, and versus pages that explain fit, tradeoffs, pricing, proof, and when to choose each option.';
  if (text.includes('process') || text.includes('methodology')) return 'Document the process step by step, including timelines, requirements, handoffs, and expected outcomes.';
  if (text.includes('pricing') || text.includes('cost')) return 'Add quote, pricing, or cost guidance with ranges, factors, inclusions, exclusions, and next steps.';
  if (text.includes('freshness')) return 'Add reviewed or updated dates to evergreen pages and refresh stale claims, screenshots, statistics, and examples.';
  if (text.includes('about') || text.includes('company')) return 'Strengthen the About page with history, leadership, credentials, service area or market focus, and external profile links.';
  if (text.includes('contact')) return 'Make contact identity visible and machine-readable with phone, email, address where relevant, forms, tel/mailto links, and matching schema.';
  if (text.includes('sameas') || text.includes('profile')) return 'Link to verified social, review, directory, marketplace, and knowledge-profile pages, then reference them with sameAs schema.';
  if (text.includes('credentials') || text.includes('trust')) return 'Add certifications, licenses, awards, partners, guarantees, review proof, and evidence that supports expertise and credibility.';
  if (text.includes('case') || text.includes('testimonial') || text.includes('proof')) return 'Create case studies or proof pages with problem, approach, measurable result, customer quote, and related offering links.';
  if (text.includes('author') || text.includes('team')) return 'Add author, reviewer, founder, expert, or team attribution to pages where experience and accountability matter.';
  if (text.includes('title') || text.includes('description') || text.includes('h1')) return 'Rewrite metadata and headings so each page has one clear topic, a unique title, and a concise answer-oriented description.';
  if (text.includes('page speed') || text.includes('performance') || text.includes('core web')) return 'Improve Core Web Vitals by compressing assets, removing unused scripts, lazy-loading media, and prioritizing critical content.';
  if (text.includes('security')) return 'Add baseline security headers and keep HTTPS redirects, HSTS, content type protections, and framing rules clean.';
  if (text.includes('accessibility') || text.includes('alt')) return 'Fix meaningful image alt text, landmarks, labels, contrast, and keyboard-friendly controls on core templates.';

  return `Create an implementation task for this ${categoryName} check, document the missing signal, update the relevant templates or pages, and validate the result after deployment.`;
}

function dedupeTasks(tasks) {
  const seen = new Set();
  return tasks.filter((task) => {
    const key = `${task.title}|${task.detail}`.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function needsAnswerBlocks(contentType) {
  return ['general', 'service', 'product', 'location', 'education', 'about'].includes(contentType || 'general');
}

function schemaRecommendation(contentType) {
  const map = {
    service: 'Service',
    product: 'Product',
    location: 'LocalBusiness',
    education: 'Article',
    about: 'Organization',
    contact: 'Organization',
  };

  return map[contentType] || 'WebPage';
}

function isUtilityPage(url = '') {
  return /privacy|terms|login|sign-in|cart|checkout|account|wp-json|feed|tag\/|category\/|author\//i.test(url);
}

function titleFromUrl(url = '') {
  try {
    const parsed = new URL(url);
    const lastPath = parsed.pathname.replace(/\/$/, '').split('/').filter(Boolean).at(-1);
    return lastPath ? lastPath.replace(/[-_]+/g, ' ') : parsed.hostname;
  } catch {
    return url || 'Untitled page';
  }
}

function slugify(value = '') {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || 'item';
}

function impactWeight(impact) {
  return { High: 3, Medium: 2, Low: 1 }[impact] || 0;
}

function impactPenalty(impact) {
  return { High: 18, Medium: 10, Low: 5 }[impact] || 6;
}

function getScoreTone(value) {
  if (value == null) {
    return {
      text: 'text-slate-400',
      bar: 'bg-slate-300',
      pill: 'bg-slate-100 text-slate-700',
    };
  }

  if (value >= 75) {
    return {
      text: 'text-emerald-700',
      bar: 'bg-emerald-500',
      pill: 'bg-emerald-100 text-emerald-700',
    };
  }

  if (value >= 55) {
    return {
      text: 'text-amber-700',
      bar: 'bg-amber-500',
      pill: 'bg-amber-100 text-amber-700',
    };
  }

  return {
    text: 'text-red-700',
    bar: 'bg-red-500',
    pill: 'bg-red-100 text-red-700',
  };
}

function formatScore(value) {
  return value == null ? 'N/A' : value;
}

function formatElapsed(seconds) {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${String(secs).padStart(2, '0')}`;
}
