import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { scoreProspectVisibility, VISIBILITY_ENGINES } from '../lib/audit/prospect-visibility.js';

const RUNS_PER_QUERY = 3;

function utcDate(row) {
  const time = Date.parse(row.observedAt);
  if (!Number.isFinite(time)) throw new Error(`Invalid observation timestamp: ${row.runId}`);
  return new Date(time).toISOString().slice(0, 10);
}

// Select by time before looking at citation outcomes. Keep all attempts in the
// raw source files; the score input contains exactly three valid runs per query.
export function selectObservedCohort(rows, queries, engine) {
  const valid = rows.filter((row) => row.engine === engine && row.valid === true);
  if (!valid.length) throw new Error(`${engine}: no valid observations`);
  const baselineDate = valid.map(utcDate).sort()[0];
  const selected = [];
  for (const query of queries) {
    const candidates = valid
      .filter((row) => row.queryId === query.id)
      .sort((a, b) => Date.parse(a.observedAt) - Date.parse(b.observedAt) || String(a.runId).localeCompare(String(b.runId)));
    const baseline = candidates.filter((row) => utcDate(row) === baselineDate).slice(0, 2);
    const later = candidates.filter((row) => utcDate(row) > baselineDate).slice(0, RUNS_PER_QUERY - baseline.length);
    if (!baseline.length || later.length !== RUNS_PER_QUERY - baseline.length) {
      throw new Error(`${engine}: ${query.id} needs one or two valid ${baselineDate} runs and enough valid later-date runs for three total`);
    }
    selected.push(...baseline, ...later);
  }
  if (selected.length !== queries.length * RUNS_PER_QUERY) throw new Error(`${engine}: incomplete cohort`);
  return { baselineDate, selected };
}

export function assembleObservedPanel(frozen, chatgptRows, googleRows, now = Date.now()) {
  if (!frozen?.frozenAt || !frozen?.brand || !Array.isArray(frozen?.queries)) {
    throw new Error('The frozen panel needs a timestamp, brand, and query list');
  }
  const queries = frozen.queries.map(({ id, prompt }) => ({ id, prompt }));
  const sources = { 'chatgpt-search': chatgptRows, 'google-ai-mode': googleRows };
  const cohorts = Object.fromEntries(VISIBILITY_ENGINES.map((engine) => [
    engine, selectObservedCohort(sources[engine], queries, engine),
  ]));
  const panel = {
    version: frozen.version,
    frozenAt: frozen.frozenAt,
    targetDomain: frozen.targetDomain,
    brand: frozen.brand,
    market: frozen.market,
    language: frozen.language,
    queries,
    observations: VISIBILITY_ENGINES.flatMap((engine) => cohorts[engine].selected),
    selectionRule: 'Earliest one or two valid runs on each engine baseline UTC date, then earliest valid later-date runs to make three per query; outcomes do not affect selection.',
    baselineDates: Object.fromEntries(VISIBILITY_ENGINES.map((engine) => [engine, cohorts[engine].baselineDate])),
  };
  const assessment = scoreProspectVisibility(panel, frozen.targetDomain, now);
  if (assessment.status !== 'observed') throw new Error(`Panel withheld: ${assessment.reason}`);
  return { panel, assessment };
}

async function main() {
  const [frozenPath, chatgptPath, googlePath, outputPath] = process.argv.slice(2);
  if (!outputPath) {
    throw new Error('Usage: node scripts/assemble-observed-panel.mjs FROZEN.json CHATGPT.json GOOGLE.json OUTPUT.json');
  }
  const [frozen, chatgpt, google] = await Promise.all([frozenPath, chatgptPath, googlePath].map(async (path) => JSON.parse(await readFile(path, 'utf8'))));
  const { panel, assessment } = assembleObservedPanel(frozen, chatgpt.observations, google.observations);
  await writeFile(outputPath, `${JSON.stringify(panel, null, 2)}\n`);
  process.stdout.write(`Saved ${assessment.runCount} reviewed runs to ${outputPath}; observed score ${assessment.score}/100.\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch((error) => {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  });
}
