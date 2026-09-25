import { MetricCard, UrlList } from './ui.js';

export default function CrawlTab({ report, audit, primary }) {
  return (
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
      <details className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <summary className="cursor-pointer text-lg font-semibold text-slate-950">Page evidence ({primary?.pages?.length || 0})</summary>
        <p className="mt-3 text-sm text-slate-600">Use the source, extracted word count, and page type to review surprising sitewide findings. A sparse page cannot support a confident content classification.</p>
        <div className="mt-4 overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="border-b border-slate-200 text-slate-500"><tr><th className="px-3 py-2">Page</th><th className="px-3 py-2">Type</th><th className="px-3 py-2">Source</th><th className="px-3 py-2">Words</th><th className="px-3 py-2">Content evidence</th></tr></thead>
            <tbody>
              {(primary?.pages || []).map((page) => <tr key={page.url} className="border-b border-slate-100 align-top">
                <td className="max-w-md break-all px-3 py-2"><a href={page.url} target="_blank" rel="noreferrer" className="text-cyan-700 underline">{page.url}</a></td>
                <td className="px-3 py-2">{page.contentType || 'unclassified'}</td>
                <td className="px-3 py-2">{page.evidenceSource === 'rendered_dom' ? 'Rendered DOM' : 'Fetched HTML'}</td>
                <td className="px-3 py-2">{page.wordCount ?? 'unknown'}</td>
                <td className="px-3 py-2">{page.contentEvidenceIncomplete ? 'Sparse · review' : 'Usable'}</td>
              </tr>)}
            </tbody>
          </table>
        </div>
      </details>
    </section>
  );
}
