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
    </section>
  );
}
