'use client';

import { useState } from 'react';

export default function Home() {
  const [url, setUrl] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [industry, setIndustry] = useState('');
  const [city, setCity] = useState('');
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState({ step: '', percent: 0 });
  const [report, setReport] = useState(null);
  const [error, setError] = useState('');

  const industries = [
    'Law Firm',
    'Roofing',
    'HVAC',
    'Plumbing',
    'Electrical',
    'General Contractor',
    'Landscaping',
    'Dental Practice',
    'Medical Practice',
    'Real Estate',
    'Accounting',
    'Other'
  ];

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setReport(null);

    // Simulate progress updates
    const progressSteps = [
      { step: 'Analyzing website speed...', percent: 15 },
      { step: 'Checking mobile performance...', percent: 30 },
      { step: 'Scanning for AI features...', percent: 45 },
      { step: 'Auditing SEO elements...', percent: 60 },
      { step: 'Checking security...', percent: 75 },
      { step: 'Generating AI insights...', percent: 90 },
      { step: 'Building your report...', percent: 100 },
    ];

    let stepIndex = 0;
    const progressInterval = setInterval(() => {
      if (stepIndex < progressSteps.length) {
        setProgress(progressSteps[stepIndex]);
        stepIndex++;
      }
    }, 2000);

    try {
      const response = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url, companyName, industry, city }),
      });

      clearInterval(progressInterval);

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to generate report');
      }

      const data = await response.json();
      setReport(data);
      setProgress({ step: 'Complete!', percent: 100 });
    } catch (err) {
      setError(err.message);
      clearInterval(progressInterval);
    } finally {
      setLoading(false);
    }
  };

  const downloadPDF = async () => {
    if (!report) return;

    // Open report in new tab for printing/saving as PDF
    const printWindow = window.open('', '_blank');
    printWindow.document.write(report.html);
    printWindow.document.close();

    // Add print button
    setTimeout(() => {
      printWindow.print();
    }, 1000);
  };

  return (
    <main className="min-h-screen p-8">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="text-center mb-12">
          <h1 className="text-4xl font-bold text-white mb-2">
            SECOND CREW
          </h1>
          <p className="text-slate-400 text-lg">
            2026 AI Website Report Generator
          </p>
        </div>

        {/* Input Form */}
        {!report && (
          <div className="bg-slate-800/50 backdrop-blur rounded-2xl p-8 border border-slate-700">
            <form onSubmit={handleSubmit} className="space-y-6">
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">
                  Website URL *
                </label>
                <input
                  type="url"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  placeholder="https://example.com"
                  required
                  className="w-full px-4 py-3 bg-slate-900/50 border border-slate-600 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-2">
                    Company Name *
                  </label>
                  <input
                    type="text"
                    value={companyName}
                    onChange={(e) => setCompanyName(e.target.value)}
                    placeholder="Acme Corp"
                    required
                    className="w-full px-4 py-3 bg-slate-900/50 border border-slate-600 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-2">
                    Industry *
                  </label>
                  <select
                    value={industry}
                    onChange={(e) => setIndustry(e.target.value)}
                    required
                    className="w-full px-4 py-3 bg-slate-900/50 border border-slate-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">Select industry</option>
                    {industries.map((ind) => (
                      <option key={ind} value={ind}>{ind}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-2">
                    City *
                  </label>
                  <input
                    type="text"
                    value={city}
                    onChange={(e) => setCity(e.target.value)}
                    placeholder="San Jose"
                    required
                    className="w-full px-4 py-3 bg-slate-900/50 border border-slate-600 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full py-4 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-500 hover:to-purple-500 text-white font-semibold rounded-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? 'Analyzing...' : 'Generate Free Report'}
              </button>
            </form>

            {/* Progress */}
            {loading && (
              <div className="mt-8">
                <div className="flex justify-between text-sm text-slate-400 mb-2">
                  <span>{progress.step}</span>
                  <span>{progress.percent}%</span>
                </div>
                <div className="h-2 bg-slate-700 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-blue-500 to-purple-500 transition-all duration-500"
                    style={{ width: `${progress.percent}%` }}
                  />
                </div>
              </div>
            )}

            {/* Error */}
            {error && (
              <div className="mt-6 p-4 bg-red-500/20 border border-red-500/50 rounded-lg">
                <p className="text-red-400">{error}</p>
              </div>
            )}
          </div>
        )}

        {/* Report Results */}
        {report && (
          <div className="space-y-6">
            {/* Action buttons */}
            <div className="flex gap-4 justify-center">
              <button
                onClick={downloadPDF}
                className="px-6 py-3 bg-blue-600 hover:bg-blue-500 text-white font-semibold rounded-lg transition-all flex items-center gap-2"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                Download PDF
              </button>
              <button
                onClick={() => {
                  const blob = new Blob([report.html], { type: 'text/html' });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement('a');
                  a.href = url;
                  a.download = `${companyName.replace(/\s+/g, '_')}_Report.html`;
                  a.click();
                }}
                className="px-6 py-3 bg-slate-700 hover:bg-slate-600 text-white font-semibold rounded-lg transition-all flex items-center gap-2"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
                Download HTML
              </button>
              <button
                onClick={() => {
                  setReport(null);
                  setUrl('');
                  setCompanyName('');
                  setIndustry('');
                  setCity('');
                }}
                className="px-6 py-3 bg-slate-800 hover:bg-slate-700 text-white font-semibold rounded-lg transition-all"
              >
                New Report
              </button>
            </div>

            {/* Quick Stats */}
            <div className="grid grid-cols-5 gap-3">
              <div className="bg-slate-800/50 rounded-xl p-4 text-center">
                <div className={`text-2xl font-bold ${report.scores.mobile >= 70 ? 'text-green-400' : report.scores.mobile >= 50 ? 'text-yellow-400' : 'text-red-400'}`}>
                  {report.scores.mobile}
                </div>
                <div className="text-slate-400 text-xs">Mobile</div>
              </div>
              <div className="bg-slate-800/50 rounded-xl p-4 text-center">
                <div className={`text-2xl font-bold ${report.scores.desktop >= 70 ? 'text-green-400' : report.scores.desktop >= 50 ? 'text-yellow-400' : 'text-red-400'}`}>
                  {report.scores.desktop}
                </div>
                <div className="text-slate-400 text-xs">Desktop</div>
              </div>
              <div className="bg-slate-800/50 rounded-xl p-4 text-center">
                <div className={`text-2xl font-bold ${report.scores.aiReadiness >= 70 ? 'text-green-400' : report.scores.aiReadiness >= 50 ? 'text-yellow-400' : 'text-red-400'}`}>
                  {report.scores.aiReadiness}
                </div>
                <div className="text-slate-400 text-xs">AI Ready</div>
              </div>
              <div className="bg-slate-800/50 rounded-xl p-4 text-center">
                <div className={`text-2xl font-bold ${report.scores.seo >= 70 ? 'text-green-400' : report.scores.seo >= 50 ? 'text-yellow-400' : 'text-red-400'}`}>
                  {report.scores.seo}
                </div>
                <div className="text-slate-400 text-xs">SEO</div>
              </div>
              <div className="bg-slate-800/50 rounded-xl p-4 text-center">
                <div className={`text-2xl font-bold ${report.scores.accessibility >= 70 ? 'text-green-400' : report.scores.accessibility >= 50 ? 'text-yellow-400' : 'text-red-400'}`}>
                  {report.scores.accessibility}
                </div>
                <div className="text-slate-400 text-xs">A11y</div>
              </div>
            </div>

            {/* Report Preview */}
            <div className="bg-white rounded-2xl overflow-hidden shadow-2xl">
              <iframe
                srcDoc={report.html}
                className="w-full h-[800px] border-0"
                title="Report Preview"
              />
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="text-center mt-12 text-slate-500 text-sm">
          <p>Powered by Second Crew • AI-Powered Web Solutions</p>
        </div>
      </div>
    </main>
  );
}
