import { describe, expect, it } from 'vitest';
import { assembleObservedPanel } from '../scripts/assemble-observed-panel.mjs';

const NOW = Date.parse('2026-09-29T12:00:00Z');

function fixture() {
  const queries = Array.from({ length: 10 }, (_, index) => ({
    id: `q${index + 1}`, prompt: `Which local agency can help with store need ${index + 1}?`,
  }));
  const frozen = {
    version: 'agency-v1', frozenAt: '2026-09-24T00:00:00Z',
    targetDomain: 'secondcrew.com', brand: 'Second Crew', market: 'Bay Area', language: 'en-US', queries,
  };
  const makeRows = (engine, baselineDate) => queries.flatMap((query) => [1, 2, 3, 4, 5].map((runId) => ({
    engine, queryId: query.id, prompt: query.prompt, runId: `${query.id}-${engine}-${runId}`,
    observedAt: `${runId <= 3 ? baselineDate : '2026-09-28'}T${String(runId).padStart(2, '0')}:00:00Z`,
    valid: true, validationStatus: 'validated', isolationVerified: true, citationsVerified: true,
    searchEnabled: true, answerShown: true, brandMentioned: false,
    model: 'fixed model', locationContext: 'California desktop', personalizationState: 'off',
    permalink: `https://example.net/evidence/${engine}/${query.id}/${runId}`,
    citedUrls: runId >= 3 ? ['https://secondcrew.com/'] : [],
  })));
  return { frozen, chatgpt: makeRows('chatgpt-search', '2026-09-26'), google: makeRows('google-ai-mode', '2026-09-27') };
}

describe('observed panel assembly', () => {
  it('selects the first two baseline runs and first later run without using citation outcomes', () => {
    const { frozen, chatgpt, google } = fixture();
    const { panel, assessment } = assembleObservedPanel(frozen, chatgpt, google, NOW);
    expect(panel.observations).toHaveLength(60);
    expect(panel.observations.filter((row) => row.queryId === 'q1' && row.engine === 'chatgpt-search').map((row) => row.runId)).toEqual([
      'q1-chatgpt-search-1', 'q1-chatgpt-search-2', 'q1-chatgpt-search-4',
    ]);
    expect(panel.baselineDates).toEqual({ 'chatgpt-search': '2026-09-26', 'google-ai-mode': '2026-09-27' });
    expect(assessment).toMatchObject({ status: 'observed', score: 33, runCount: 60 });
  });

  it('refuses an incomplete later-date panel', () => {
    const { frozen, chatgpt, google } = fixture();
    expect(() => assembleObservedPanel(frozen, chatgpt, google.filter((row) => row.runId !== 'q1-google-ai-mode-4' && row.runId !== 'q1-google-ai-mode-5'), NOW)).toThrow(/q1 needs two valid .* and one valid later-date run/);
  });
});
