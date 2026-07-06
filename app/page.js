'use client';

import { useMemo, useState } from 'react';
import { buildActionPlan } from '../lib/action-plan.js';
import { readAuditStream } from '../lib/audit-stream.js';
import AuditForm from './components/AuditForm.js';
import OverviewTab from './components/OverviewTab.js';
import FindingsTab from './components/FindingsTab.js';
import CategoriesTab from './components/CategoriesTab.js';
import CompetitorsTab from './components/CompetitorsTab.js';
import CrawlTab from './components/CrawlTab.js';
import { ActionPlanView, PlanUnlockCta } from './components/ActionPlan.js';
import SendReportPanel from './components/SendReportPanel.js';
import HistoryPanel from './components/HistoryPanel.js';

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
  const [sendPanelOpen, setSendPanelOpen] = useState(false);

  const audit = report?.audit;
  const primary = audit?.primary;
  const categoryDetails = useMemo(() => primary?.categoryDetails || {}, [primary]);
  const findings = useMemo(() => primary?.findings || [], [primary]);
  const competitorComparison = audit?.competitorComparison || [];
  const reportTabs = useMemo(
    () => (planUnlocked ? [...tabs, { id: 'plan', label: 'Action Plan' }] : tabs),
    [planUnlocked]
  );
  const actionPlan = useMemo(
    () => buildActionPlan(report, primary, categoryDetails, findings),
    [report, primary, categoryDetails, findings]
  );

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

  // Print the report workspace through the print stylesheet (app chrome is
  // hidden with print:hidden classes); only the active tab is printed.
  const printPDF = () => {
    if (!report) return;
    window.print();
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

  const openFindingsWithSeverity = (severity) => {
    setSeverityFilter(severity);
    setActiveTab('findings');
  };

  return (
    <main className="min-h-screen bg-[#f4f7fb] text-slate-950 print:bg-white">
      {!report ? (
        <>
          <AuditForm
            url={url}
            companyName={companyName}
            competitorUrls={competitorUrls}
            onUrlChange={setUrl}
            onCompanyNameChange={setCompanyName}
            onCompetitorUrlsChange={setCompetitorUrls}
            onSubmit={handleSubmit}
            loading={loading}
            progress={progress}
            elapsedSeconds={elapsedSeconds}
            error={error}
          />
          <div className="mx-auto max-w-5xl px-5 pb-16">
            <HistoryPanel />
          </div>
        </>
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

                <div className="flex flex-wrap gap-3 print:hidden">
                  <button
                    onClick={() => setSendPanelOpen((open) => !open)}
                    className={`rounded-md px-4 py-2 text-sm font-semibold transition ${
                      sendPanelOpen
                        ? 'bg-cyan-600 text-white hover:bg-cyan-500'
                        : 'border border-cyan-300 bg-cyan-50 text-cyan-800 hover:bg-cyan-100'
                    }`}
                  >
                    Send to Prospect
                  </button>
                  <button onClick={printPDF} className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-800 transition hover:bg-slate-50">
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

          <div className="sticky top-0 z-20 border-b border-slate-200 bg-white/95 backdrop-blur print:hidden">
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
            {sendPanelOpen && (
              <div className="mb-6">
                <SendReportPanel domain={primary?.domain} persistence={report.persistence} />
              </div>
            )}

            {activeTab === 'overview' && (
              <OverviewTab
                report={report}
                primary={primary}
                findings={findings}
                onSelectSeverity={openFindingsWithSeverity}
              />
            )}

            {activeTab === 'findings' && (
              <FindingsTab
                findings={findings}
                severityFilter={severityFilter}
                onFilterChange={setSeverityFilter}
              />
            )}

            {activeTab === 'categories' && <CategoriesTab categoryDetails={categoryDetails} />}

            {activeTab === 'competitors' && (
              <CompetitorsTab
                competitorComparison={competitorComparison}
                primaryName={companyName || primary?.domain}
                primaryScores={primary?.scores}
              />
            )}

            {activeTab === 'crawl' && <CrawlTab report={report} audit={audit} primary={primary} />}

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
