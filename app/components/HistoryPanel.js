import { useEffect, useState } from 'react';
import { getScoreTone } from './ui.js';

// Home-screen list of past diagnostics with their send/open status, loaded
// from Supabase via /api/history.
export default function HistoryPanel() {
  const [state, setState] = useState({ status: 'loading', audits: [], error: '' });

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const response = await fetch('/api/history');
        const data = await response.json().catch(() => ({}));
        if (cancelled) return;
        if (response.status === 503) {
          setState({ status: 'unconfigured', audits: [], error: data.error || '' });
        } else if (!response.ok) {
          setState({ status: 'error', audits: [], error: data.error || 'Failed to load history' });
        } else {
          setState({ status: 'ready', audits: data.audits || [], error: '' });
        }
      } catch {
        if (!cancelled) setState({ status: 'error', audits: [], error: 'Failed to load history' });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  if (state.status === 'loading') return null;

  if (state.status === 'unconfigured') {
    return (
      <section className="rounded-lg border border-dashed border-slate-300 bg-white/60 p-5">
        <h2 className="text-sm font-semibold uppercase tracking-[0.12em] text-slate-500">Past Diagnostics</h2>
        <p className="mt-2 text-sm text-slate-500">
          Connect Supabase (SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY) to keep a history of every diagnostic you run,
          who you sent each report to, and whether they opened it.
        </p>
      </section>
    );
  }

  if (state.status === 'error') {
    return (
      <section className="rounded-lg border border-red-200 bg-red-50 p-5">
        <h2 className="text-sm font-semibold uppercase tracking-[0.12em] text-red-700">Past Diagnostics</h2>
        <p className="mt-2 text-sm text-red-700">{state.error}</p>
      </section>
    );
  }

  return (
    <section className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold text-slate-950">Past Diagnostics</h2>
          <p className="mt-1 text-sm text-slate-500">Every audit you have run, with send and open status per prospect.</p>
        </div>
        <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">{state.audits.length} audits</span>
      </div>

      {state.audits.length ? (
        <div className="mt-5 overflow-x-auto rounded-md border border-slate-200">
          <table className="w-full border-collapse text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-[0.12em] text-slate-500">
              <tr>
                <th className="px-4 py-3 font-semibold">Date</th>
                <th className="px-4 py-3 font-semibold">Prospect</th>
                <th className="px-4 py-3 font-semibold">Overall</th>
                <th className="px-4 py-3 font-semibold">GEO/AEO</th>
                <th className="px-4 py-3 font-semibold">Status</th>
                <th className="px-4 py-3 font-semibold">Report</th>
              </tr>
            </thead>
            <tbody>
              {state.audits.map((audit) => (
                <HistoryRow key={audit.id} audit={audit} />
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="mt-4 text-sm text-slate-500">No diagnostics saved yet. Run your first audit above.</p>
      )}
    </section>
  );
}

function HistoryRow({ audit }) {
  const sends = (audit.sends || []).slice().sort((a, b) => new Date(b.sent_at) - new Date(a.sent_at));

  return (
    <tr className="border-t border-slate-200 align-top">
      <td className="whitespace-nowrap px-4 py-3 text-slate-600">{formatDate(audit.created_at)}</td>
      <td className="px-4 py-3">
        <div className="font-medium text-slate-900">{audit.client?.company_name || audit.domain}</div>
        <div className="break-all text-xs text-slate-500">{audit.domain}</div>
      </td>
      <td className="px-4 py-3"><ScoreBadge value={audit.scores?.overall} /></td>
      <td className="px-4 py-3"><ScoreBadge value={audit.scores?.aeoGeo} /></td>
      <td className="px-4 py-3">
        {sends.length ? (
          <div className="space-y-1.5">
            {sends.map((send) => (
              <div key={send.id} className="flex flex-wrap items-center gap-2">
                <span className="text-slate-600">{send.prospect_name || send.prospect_email}</span>
                {send.open_count > 0 ? (
                  <span
                    className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-700"
                    title={send.last_opened_at ? `Last opened ${formatDate(send.last_opened_at)}` : undefined}
                  >
                    Opened {send.open_count}×
                  </span>
                ) : (
                  <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-700">
                    Sent · not opened
                  </span>
                )}
              </div>
            ))}
          </div>
        ) : (
          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-600">Not sent</span>
        )}
      </td>
      <td className="whitespace-nowrap px-4 py-3">
        <a
          href={`/reports/${audit.id}`}
          target="_blank"
          rel="noreferrer"
          className="text-sm font-semibold text-cyan-700 hover:text-cyan-900"
        >
          View
        </a>
      </td>
    </tr>
  );
}

function ScoreBadge({ value }) {
  if (value == null) return <span className="text-slate-400">—</span>;
  return <span className={`text-base font-semibold ${getScoreTone(value).text}`}>{value}</span>;
}

function formatDate(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}
