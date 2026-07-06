import { Metric, getScoreTone } from './ui.js';

export function PlanUnlockCta({ plan, onOpen, unlocked }) {
  return (
    <section className="mt-8 rounded-lg border border-slate-800 bg-slate-950 p-6 text-white shadow-sm print:hidden md:p-7">
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

export function ActionPlanView({ plan, primary, onOpenFindings }) {
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
            className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-800 transition hover:bg-slate-50 print:hidden"
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
