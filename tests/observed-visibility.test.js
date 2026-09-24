import { describe, expect, it } from 'vitest';
import { scoreObservedVisibility } from '../lib/audit/observed-visibility.js';

describe('observed AI visibility', () => {
  it('withholds a score until the fixed panel has enough complete repeated observations', () => {
    const rows = [{ queryId: 'q1', runId: 'r1', engine: 'chatgpt-search', answerShown: true, citedUrls: ['https://example.com/a'] }];
    expect(scoreObservedVisibility(rows, 'example.com', { engine: 'chatgpt-search', minQueries: 2, minRunsPerQuery: 2 })).toMatchObject({ status: 'not_assessed', score: null });
  });

  it('reports observed citations separately from answer triggers and brand mentions', () => {
    const rows = [
      { queryId: 'q1', runId: 'r1', engine: 'chatgpt-search', answerShown: true, citedUrls: ['https://www.example.com/a'], brandMentioned: true },
      { queryId: 'q1', runId: 'r2', engine: 'chatgpt-search', answerShown: true, citedUrls: ['https://other.example/a'], brandMentioned: true },
      { queryId: 'q2', runId: 'r1', engine: 'chatgpt-search', answerShown: false, citedUrls: [] },
      { queryId: 'q2', runId: 'r2', engine: 'chatgpt-search', answerShown: true, citedUrls: ['https://shop.example.com/p'], brandMentioned: false },
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
});
