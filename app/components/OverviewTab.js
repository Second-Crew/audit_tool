import { Metric, ScoreCard, SeverityBadge, SignalPanel, StatusPill, formatScore, getScoreTone } from './ui.js';

export default function OverviewTab({ report, primary, findings, onSelectSeverity }) {
  const topFindings = findings.slice(0, 5);
  const scoreCards = [
    { label: 'Overall', value: report?.scores?.overall, caption: 'Diagnostic score' },
    { label: 'GEO / AEO', value: report?.scores?.aeoGeo, caption: 'AI answer readiness' },
    { label: 'AI Readiness', value: report?.scores?.aiReadiness, caption: 'Entity and crawler signals' },
    { label: 'SEO', value: report?.scores?.seo, caption: 'Technical foundation' },
    { label: 'Mobile', value: report?.scores?.mobile, caption: 'PageSpeed mobile' },
    { label: 'Security', value: report?.scores?.security, caption: 'Header baseline' },
  ];

  return (
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
                onClick={() => onSelectSeverity(finding.severity)}
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

function llmItems(report) {
  const llm = report?.llm || {};
  return [
    { label: 'Provider', value: llm.provider || 'none', ok: llm.status === 'generated' },
    { label: 'Model', value: llm.model || 'not configured', ok: llm.status === 'generated' },
    { label: 'Status', value: llm.status || 'skipped', ok: llm.status === 'generated' },
  ];
}
