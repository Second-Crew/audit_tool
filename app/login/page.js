'use client';

import { useState } from 'react';

export default function Login() {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    setError('');

    try {
      const response = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'Login failed');
      window.location.href = '/';
    } catch (err) {
      setError(err.message);
      setSubmitting(false);
    }
  };

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#f4f7fb] px-5 text-slate-950">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <div className="text-xs font-semibold uppercase tracking-[0.28em] text-slate-500">Second Crew</div>
          <h1 className="mt-3 text-3xl font-semibold tracking-normal text-slate-950">Diagnostic workspace</h1>
          <p className="mt-2 text-sm text-slate-500">Enter the team password to continue.</p>
        </div>

        <section className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm md:p-8">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="mb-2 block text-sm font-medium text-slate-700">Password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoFocus
                required
                className="w-full rounded-md border border-slate-300 bg-white px-4 py-3 text-slate-950 placeholder-slate-400 outline-none transition focus:border-cyan-500 focus:ring-4 focus:ring-cyan-100"
              />
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="flex w-full items-center justify-center rounded-md bg-slate-950 px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {submitting ? 'Signing in...' : 'Enter Workspace'}
            </button>
          </form>

          {error && (
            <div className="mt-4 rounded-md border border-red-200 bg-red-50 p-3">
              <p className="text-sm font-medium text-red-700">{error}</p>
            </div>
          )}
        </section>

        <p className="mt-6 text-center text-xs text-slate-400">
          Report links sent to prospects are not affected by this login.
        </p>
      </div>
    </main>
  );
}
