import { describe, expect, it } from 'vitest';
import { scoreObservedVisibility } from '../lib/audit/observed-visibility.js';
import panelObservations from '../docs/query-panel-observations.json';
import panelQueries from '../docs/calibration-query-panel.json';

describe('observed AI visibility', () => {
  it('withholds a score until the fixed panel has enough complete repeated observations', () => {
    const rows = [{ queryId: 'q1', runId: 'r1', engine: 'chatgpt-search', valid: true, answerShown: true, citedUrls: ['https://example.com/a'] }];
    expect(scoreObservedVisibility(rows, 'example.com', { engine: 'chatgpt-search', minQueries: 2, minRunsPerQuery: 2 })).toMatchObject({ status: 'not_assessed', score: null });
  });

  it('reports observed citations separately from answer triggers and brand mentions', () => {
    const rows = [
      { queryId: 'q1', runId: 'r1', engine: 'chatgpt-search', valid: true, answerShown: true, citedUrls: ['https://www.example.com/a'], brandMentioned: true },
      { queryId: 'q1', runId: 'r2', engine: 'chatgpt-search', valid: true, answerShown: true, citedUrls: ['https://other.example/a'], brandMentioned: true },
      { queryId: 'q2', runId: 'r1', engine: 'chatgpt-search', valid: true, answerShown: false, citedUrls: [] },
      { queryId: 'q2', runId: 'r2', engine: 'chatgpt-search', valid: true, answerShown: true, citedUrls: ['https://shop.example.com/p'], brandMentioned: false },
    ];
    expect(scoreObservedVisibility(rows, 'example.com', { engine: 'chatgpt-search', minQueries: 2, minRunsPerQuery: 2 })).toMatchObject({
      status: 'observed',
      metric: 'fixed_panel_citation_rate',
      score: 50,
      citationRate: 0.5,
      answerTriggerRate: 0.75,
      mentionRate: 0.5,
      queryCount: 2,
      runCount: 4,
    });
  });

  it('excludes invalid runs and accepts the recorded panel format', () => {
    const rows = [
      { queryId: 'q1', runId: 'r1', engine: 'chatgpt-search', valid: true, answerShown: true, citedUrls: [] },
      { queryId: 'q1', runId: 'r2', engine: 'chatgpt-search', valid: true, answerShown: true, citedUrls: [] },
      { queryId: 'q1', runId: 'r3', engine: 'chatgpt-search', valid: false, answerShown: false, citedUrls: [] },
    ];
    expect(scoreObservedVisibility(rows, 'secondcrew.com', { engine: 'chatgpt-search', minQueries: 1, minRunsPerQuery: 3 })).toMatchObject({ status: 'not_assessed', score: null });

    const recorded = panelObservations.observations.filter((row) => row.runId <= 2);
    expect(recorded).toHaveLength(20);
    expect(scoreObservedVisibility(recorded, 'secondcrew.com', { engine: 'chatgpt-search' })).toMatchObject({ status: 'not_assessed', score: null });
    expect(recorded.every((row) => row.valid === false && row.invalidReason)).toBe(true);
    expect(scoreObservedVisibility(recorded, 'secondcrew.com', { engine: 'chatgpt-search', minRunsPerQuery: 2, queryIds: panelQueries.queries.map((query) => query.id) })).toMatchObject({ status: 'not_assessed', score: null, queryCount: 0 });
  });

  it('does not substitute unrelated prompts for a missing frozen-panel query', () => {
    const expected = ['frozen-1', 'frozen-2'];
    const rows = ['frozen-1', 'unrelated'].flatMap((queryId) => [1, 2, 3].map((runId) => ({
      queryId, runId, engine: 'chatgpt-search', valid: true, answerShown: true, citedUrls: [],
    })));
    expect(scoreObservedVisibility(rows, 'secondcrew.com', { engine: 'chatgpt-search', queryIds: expected })).toMatchObject({
      status: 'not_assessed', score: null, queryCount: 1, requiredQueries: 2,
    });
  });

  it('requires affirmative validation before a run can count', () => {
    const unreviewed = { queryId: 'q1', runId: 1, engine: 'chatgpt-search', answerShown: true, citedUrls: ['https://secondcrew.com/'] };
    expect(scoreObservedVisibility([unreviewed], 'secondcrew.com', { engine: 'chatgpt-search', queryIds: ['q1'], minRunsPerQuery: 1 })).toMatchObject({
      status: 'not_assessed', score: null, queryCount: 0,
    });
  });
});
