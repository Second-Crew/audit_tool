export default function AuditForm({
  url,
  companyName,
  competitorUrls,
  onUrlChange,
  onCompanyNameChange,
  onCompetitorUrlsChange,
  onSubmit,
  loading,
  progress,
  elapsedSeconds,
  error,
}) {
  return (
    <section className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm md:p-8">
      <h2 className="text-xl font-semibold text-slate-950">Run a Diagnostic</h2>
      <p className="mt-1 text-sm text-slate-500">
        Crawl the site, collect evidence, compare manual competitors, and generate a paid-diagnostic style report.
      </p>

      <form onSubmit={onSubmit} className="mt-6 space-y-6">
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          <div>
            <label className="mb-2 block text-sm font-medium text-slate-700">Website URL</label>
            <input
              type="text"
              value={url}
              onChange={(e) => onUrlChange(e.target.value)}
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
              onChange={(e) => onCompanyNameChange(e.target.value)}
              placeholder="Acme Corp"
              className="w-full rounded-md border border-slate-300 bg-white px-4 py-3 text-slate-950 placeholder-slate-400 outline-none transition focus:border-cyan-500 focus:ring-4 focus:ring-cyan-100"
            />
          </div>
        </div>

        <div>
          <label className="mb-2 block text-sm font-medium text-slate-700">Manual Competitor URLs</label>
          <textarea
            value={competitorUrls}
            onChange={(e) => onCompetitorUrlsChange(e.target.value)}
            placeholder={'competitor-one.com\nhttps://competitor-two.com'}
            rows={3}
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

      {loading && <ProgressPanel progress={progress} elapsedSeconds={elapsedSeconds} />}

      {error && (
        <div className="mt-6 rounded-md border border-red-200 bg-red-50 p-4">
          <p className="text-sm font-medium text-red-700">{error}</p>
        </div>
      )}
    </section>
  );
}

function ProgressPanel({ progress, elapsedSeconds }) {
  return (
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
  );
}

function formatElapsed(seconds) {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${String(secs).padStart(2, '0')}`;
}
