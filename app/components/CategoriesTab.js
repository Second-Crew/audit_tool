import { CheckStatus, getScoreTone } from './ui.js';

export default function CategoriesTab({ categoryDetails }) {
  return (
    <section className="space-y-4">
      <div>
        <h2 className="text-2xl font-semibold text-slate-950">Category Breakdown</h2>
        <p className="mt-1 text-sm text-slate-500">Open each category to inspect passed, partial, failed, and unknown checks.</p>
      </div>
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        {Object.values(categoryDetails).map((category) => (
          <CategoryPanel key={category.name} category={category} />
        ))}
      </div>
    </section>
  );
}

function CategoryPanel({ category }) {
  return (
    <details className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm" open={category.score < 80}>
      <summary className="cursor-pointer list-none">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h3 className="text-lg font-semibold text-slate-950">{category.name}</h3>
            <p className="mt-1 text-sm text-slate-500">{category.points}/{category.maxPoints} points</p>
          </div>
          <div className={`text-3xl font-semibold ${getScoreTone(category.score).text}`}>{category.score}</div>
        </div>
      </summary>
      <div className="mt-5 overflow-hidden rounded-md border border-slate-200">
        <table className="w-full border-collapse text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase tracking-[0.12em] text-slate-500">
            <tr>
              <th className="px-4 py-3 font-semibold">Check</th>
              <th className="px-4 py-3 font-semibold">Status</th>
              <th className="px-4 py-3 font-semibold">Evidence</th>
            </tr>
          </thead>
          <tbody>
            {category.checks.map((check) => (
              <tr key={`${category.name}-${check.label}`} className="border-t border-slate-200">
                <td className="px-4 py-3 font-medium text-slate-800">{check.label}</td>
                <td className="px-4 py-3"><CheckStatus status={check.status} score={check.score} maxScore={check.maxScore} /></td>
                <td className="px-4 py-3 text-slate-600">{check.evidence}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}
