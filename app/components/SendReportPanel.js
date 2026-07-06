import { useCallback, useEffect, useState } from 'react';

// Logs who a report was sent to and produces the tracked link (/r/<id>) to
// paste into the outreach email. Requires the audit to be saved to Supabase.
export default function SendReportPanel({ domain, persistence }) {
  const [prospectName, setProspectName] = useState('');
  const [prospectEmail, setProspectEmail] = useState('');
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');
  const [createdLink, setCreatedLink] = useState('');
  const [copied, setCopied] = useState(false);
  const [sends, setSends] = useState(null);

  const trackingReady = persistence?.status === 'saved' && Boolean(persistence?.auditId);

  const loadSends = useCallback(async () => {
    if (!domain || !trackingReady) return;
    try {
      const response = await fetch(`/api/sends?domain=${encodeURIComponent(domain)}`);
      if (!response.ok) return;
      const data = await response.json();
      setSends(data.sends || []);
    } catch {
      // The history list is informational; creation errors are surfaced below.
    }
  }, [domain, trackingReady]);

  useEffect(() => {
    loadSends();
  }, [loadSends]);

  const handleCreate = async (e) => {
    e.preventDefault();
    setCreating(true);
    setError('');
    setCreatedLink('');
    setCopied(false);

    try {
      const response = await fetch('/api/sends', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          auditId: persistence.auditId,
          clientId: persistence.clientId,
          domain,
          prospectName,
          prospectEmail,
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'Failed to record the send');

      const appUrl = (process.env.NEXT_PUBLIC_APP_URL || window.location.origin).replace(/\/+$/, '');
      setCreatedLink(`${appUrl}/r/${data.send.id}`);
      setProspectName('');
      setProspectEmail('');
      loadSends();
    } catch (err) {
      setError(err.message);
    } finally {
      setCreating(false);
    }
  };

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(createdLink);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };

  return (
    <section className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm print:hidden">
      <h2 className="text-xl font-semibold text-slate-950">Send to Prospect</h2>
      <p className="mt-1 text-sm text-slate-500">
        Log who this report goes to and get a tracked link. When the prospect opens the link, the open is recorded here.
      </p>

      {!trackingReady ? (
        <div className="mt-4 rounded-md border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          This audit was not saved to Supabase ({persistence?.reason || persistence?.status || 'persistence skipped'}), so send
          tracking is unavailable. Configure SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY, then rerun the audit.
        </div>
      ) : (
        <>
          <form onSubmit={handleCreate} className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-[1fr_1.2fr_auto]">
            <input
              type="text"
              value={prospectName}
              onChange={(e) => setProspectName(e.target.value)}
              placeholder="Prospect name (optional)"
              className="rounded-md border border-slate-300 bg-white px-4 py-3 text-sm text-slate-950 placeholder-slate-400 outline-none transition focus:border-cyan-500 focus:ring-4 focus:ring-cyan-100"
            />
            <input
              type="email"
              value={prospectEmail}
              onChange={(e) => setProspectEmail(e.target.value)}
              placeholder="prospect@company.com"
              required
              className="rounded-md border border-slate-300 bg-white px-4 py-3 text-sm text-slate-950 placeholder-slate-400 outline-none transition focus:border-cyan-500 focus:ring-4 focus:ring-cyan-100"
            />
            <button
              type="submit"
              disabled={creating}
              className="rounded-md bg-slate-950 px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {creating ? 'Creating...' : 'Create Tracked Link'}
            </button>
          </form>

          {error && (
            <div className="mt-3 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>
          )}

          {createdLink && (
            <div className="mt-4 rounded-md border border-cyan-200 bg-cyan-50 p-4">
              <div className="text-xs font-semibold uppercase tracking-[0.12em] text-cyan-700">Tracked report link</div>
              <div className="mt-2 flex flex-col gap-2 md:flex-row md:items-center">
                <code className="min-w-0 break-all rounded-md bg-white px-3 py-2 text-sm text-slate-800">{createdLink}</code>
                <button
                  type="button"
                  onClick={copyLink}
                  className="shrink-0 rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-800 transition hover:bg-slate-50"
                >
                  {copied ? 'Copied!' : 'Copy'}
                </button>
              </div>
              <p className="mt-2 text-xs text-slate-500">
                Paste this into your email instead of attaching the HTML file. Note: opening the link yourself also counts as an open.
              </p>
            </div>
          )}

          <div className="mt-5">
            <h3 className="text-sm font-semibold uppercase tracking-[0.12em] text-slate-500">Send history for {domain}</h3>
            {!sends ? (
              <p className="mt-2 text-sm text-slate-500">Loading send history...</p>
            ) : sends.length ? (
              <div className="mt-2 overflow-x-auto rounded-md border border-slate-200">
                <table className="w-full border-collapse text-left text-sm">
                  <thead className="bg-slate-50 text-xs uppercase tracking-[0.12em] text-slate-500">
                    <tr>
                      <th className="px-4 py-3 font-semibold">Prospect</th>
                      <th className="px-4 py-3 font-semibold">Sent</th>
                      <th className="px-4 py-3 font-semibold">Opens</th>
                      <th className="px-4 py-3 font-semibold">Last Opened</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sends.map((send) => (
                      <tr key={send.id} className="border-t border-slate-200">
                        <td className="px-4 py-3">
                          <div className="font-medium text-slate-800">{send.prospect_name || '—'}</div>
                          <div className="text-slate-500">{send.prospect_email}</div>
                        </td>
                        <td className="px-4 py-3 text-slate-600">{formatDate(send.sent_at)}</td>
                        <td className="px-4 py-3">
                          {send.open_count > 0 ? (
                            <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-semibold text-emerald-700">
                              Opened {send.open_count}×
                            </span>
                          ) : (
                            <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600">Not opened</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-slate-600">{send.last_opened_at ? formatDate(send.last_opened_at) : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="mt-2 text-sm text-slate-500">No reports have been sent for this domain yet.</p>
            )}
          </div>
        </>
      )}
    </section>
  );
}

function formatDate(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleString();
}
