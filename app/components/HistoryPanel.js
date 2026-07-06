import { useEffect, useState } from 'react';
import { getScoreTone } from './ui.js';

// Home-screen list of past diagnostics with their send/open status, loaded
// from Supabase via /api/history. Each row can reopen the stored report,
// download the LLM-ready Markdown, or send a tracked link to the prospect.
export default function HistoryPanel({ onOpenAudit }) {
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

  const allSends = state.audits.flatMap((audit) => audit.sends || []);
  const openedSends = allSends.filter((send) => send.open_count > 0);

  return (
    <section className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
      <div>
        <h2 className="text-xl font-semibold text-slate-950">Past Diagnostics</h2>
        <p className="mt-1 text-sm text-slate-500">
          Every audit you have run. View or export a report, send a tracked link to the prospect, and watch opens come in.
        </p>
      </div>

      <div className="mt-4 grid grid-cols-3 gap-3">
        <StatCard label="Diagnostics" value={state.audits.length} />
        <StatCard label="Reports Sent" value={allSends.length} />
        <StatCard label="Opened" value={openedSends.length} />
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
                <th className="px-4 py-3 font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody>
              {state.audits.map((audit) => (
                <HistoryRow key={audit.id} audit={audit} onOpenAudit={onOpenAudit} />
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

function HistoryRow({ audit, onOpenAudit }) {
  const [sendOpen, setSendOpen] = useState(false);
  const [extraSends, setExtraSends] = useState([]);

  const sends = [...(audit.sends || []), ...extraSends]
    .slice()
    .sort((a, b) => new Date(b.sent_at) - new Date(a.sent_at));

  return (
    <>
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
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => onOpenAudit?.(audit.id)}
              className="text-sm font-semibold text-cyan-700 hover:text-cyan-900"
              title="Reopen in the full workspace with tabs, action plan, and exports"
            >
              Open
            </button>
            <a
              href={`/reports/${audit.id}`}
              target="_blank"
              rel="noreferrer"
              className="text-sm font-semibold text-cyan-700 hover:text-cyan-900"
              title="Static HTML report (what the prospect sees)"
            >
              HTML
            </a>
            <a
              href={`/reports/${audit.id}?format=markdown`}
              className="text-sm font-semibold text-cyan-700 hover:text-cyan-900"
              title="Download LLM-ready Markdown"
            >
              Markdown
            </a>
            <button
              type="button"
              onClick={() => setSendOpen((open) => !open)}
              className="text-sm font-semibold text-cyan-700 hover:text-cyan-900"
            >
              {sendOpen ? 'Close' : 'Send'}
            </button>
          </div>
        </td>
      </tr>
      {sendOpen && (
        <tr className="border-t border-slate-100 bg-slate-50">
          <td colSpan={6} className="px-4 py-4">
            <RowSendForm audit={audit} onCreated={(send) => setExtraSends((previous) => [...previous, send])} />
          </td>
        </tr>
      )}
    </>
  );
}

function RowSendForm({ audit, onCreated }) {
  const [prospectName, setProspectName] = useState('');
  const [prospectEmail, setProspectEmail] = useState('');
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');
  const [link, setLink] = useState('');
  const [copied, setCopied] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setCreating(true);
    setError('');
    setCopied(false);

    try {
      const response = await fetch('/api/sends', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          auditId: audit.id,
          clientId: audit.client_id,
          domain: audit.domain,
          prospectName,
          prospectEmail,
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'Failed to record the send');

      const appUrl = (process.env.NEXT_PUBLIC_APP_URL || window.location.origin).replace(/\/+$/, '');
      setLink(`${appUrl}/r/${data.send.id}`);
      onCreated(data.send);
      setProspectName('');
      setProspectEmail('');
    } catch (err) {
      setError(err.message);
    } finally {
      setCreating(false);
    }
  };

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };

  return (
    <div>
      <form onSubmit={handleSubmit} className="grid grid-cols-1 gap-3 md:grid-cols-[1fr_1.2fr_auto]">
        <input
          type="text"
          value={prospectName}
          onChange={(e) => setProspectName(e.target.value)}
          placeholder="Prospect name (optional)"
          className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-950 placeholder-slate-400 outline-none transition focus:border-cyan-500 focus:ring-4 focus:ring-cyan-100"
        />
        <input
          type="email"
          value={prospectEmail}
          onChange={(e) => setProspectEmail(e.target.value)}
          placeholder="prospect@company.com"
          required
          className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-950 placeholder-slate-400 outline-none transition focus:border-cyan-500 focus:ring-4 focus:ring-cyan-100"
        />
        <button
          type="submit"
          disabled={creating}
          className="rounded-md bg-slate-950 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {creating ? 'Creating...' : 'Create Tracked Link'}
        </button>
      </form>

      {error && <p className="mt-2 text-sm text-red-700">{error}</p>}

      {link && (
        <div className="mt-3 flex flex-col gap-2 md:flex-row md:items-center">
          <code className="min-w-0 break-all rounded-md bg-white px-3 py-2 text-sm text-slate-800">{link}</code>
          <button
            type="button"
            onClick={copyLink}
            className="shrink-0 rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-800 transition hover:bg-slate-50"
          >
            {copied ? 'Copied!' : 'Copy'}
          </button>
        </div>
      )}
    </div>
  );
}

function StatCard({ label, value }) {
  return (
    <div className="rounded-md border border-slate-200 bg-slate-50 p-4">
      <div className="text-2xl font-semibold text-slate-950">{value}</div>
      <div className="mt-1 text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">{label}</div>
    </div>
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
