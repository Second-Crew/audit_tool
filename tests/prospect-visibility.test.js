import { describe, expect, it } from 'vitest';
import { scoreProspectVisibility } from '../lib/audit/prospect-visibility.js';

const NOW = Date.parse('2026-09-26T22:00:00Z');

function completePanel() {
  const queries = Array.from({ length: 10 }, (_, index) => ({
    id: `q${index + 1}`,
    prompt: `Which local ecommerce agencies can help with need ${index + 1}?`,
  }));
  const observations = ['chatgpt-search', 'google-ai-mode'].flatMap((engine) =>
    queries.flatMap((query) => [1, 2, 3].map((runId) => ({
      engine, queryId: query.id, prompt: query.prompt, runId,
      observedAt: runId === 3 ? '2026-09-26T18:00:00Z' : '2026-09-25T18:00:00Z',
      valid: true, validationStatus: 'validated', isolationVerified: true,
      citationsVerified: true, searchEnabled: true, answerShown: true,
      brandMentioned: false, model: 'fixed model', locationContext: 'California desktop',
      personalizationState: 'off',
      permalink: `https://example.net/evidence/${engine}/${query.id}/${runId}`,
      citedUrls: runId <= (engine === 'google-ai-mode' ? 2 : 1) ? ['https://www.secondcrew.com/services'] : [],
    }))));
  return {
    version: 'prospect-agency-v1', frozenAt: '2026-09-24T12:00:00Z',
    targetDomain: 'secondcrew.com', brand: 'Second Crew', market: 'Bay Area', language: 'en-US',
    queries, observations,
  };
}

describe('prospect GEO/AEO observed visibility', () => {
  it('scores only a complete, two-date panel for both engines', () => {
    const result = scoreProspectVisibility(completePanel(), 'secondcrew.com', NOW);
    expect(result).toMatchObject({
      status: 'observed', metric: 'two_engine_observed_citation_rate', score: 50,
      queryCount: 10, runCount: 60,
      engines: {
        'chatgpt-search': { score: 33, queryCount: 10, runCount: 30 },
        'google-ai-mode': { score: 67, queryCount: 10, runCount: 30 },
      },
    });
    expect(result.queryBreakdown).toHaveLength(10);
    expect(result.queryBreakdown[0].engines).toMatchObject({
      'chatgpt-search': { citations: 1, answers: 3, runs: 3 },
      'google-ai-mode': { citations: 2, answers: 3, runs: 3 },
    });
  });

  it('keeps a measured zero distinct from an incomplete panel', () => {
    const panel = completePanel();
    panel.observations.forEach((row) => { row.citedUrls = []; });
    expect(scoreProspectVisibility(panel, 'secondcrew.com', NOW)).toMatchObject({ status: 'observed', score: 0 });
    panel.observations.pop();
    expect(scoreProspectVisibility(panel, 'secondcrew.com', NOW)).toMatchObject({ status: 'not_assessed', score: null });
  });

  it('rejects observations for another website or changed prompts', () => {
    const panel = completePanel();
    expect(scoreProspectVisibility(panel, 'other.example', NOW)).toMatchObject({ status: 'not_assessed', score: null });
    panel.observations[0].prompt = 'A changed prompt';
    expect(scoreProspectVisibility(panel, 'secondcrew.com', NOW)).toMatchObject({ status: 'not_assessed', score: null });
  });

  it('requires independent evidence across two dates', () => {
    const panel = completePanel();
    panel.observations[1].permalink = panel.observations[0].permalink;
    expect(scoreProspectVisibility(panel, 'secondcrew.com', NOW)).toMatchObject({ status: 'not_assessed', score: null });
    panel.observations[1].permalink = 'https://example.net/repaired';
    panel.observations.forEach((row) => { row.observedAt = '2026-09-26T18:00:00Z'; });
    expect(scoreProspectVisibility(panel, 'secondcrew.com', NOW)).toMatchObject({ status: 'not_assessed', score: null });
  });

  it('rejects unreviewed citations and brand-seeded prompts', () => {
    const panel = completePanel();
    panel.observations[0].citationsVerified = false;
    expect(scoreProspectVisibility(panel, 'secondcrew.com', NOW)).toMatchObject({ status: 'not_assessed', score: null });
    panel.observations[0].citationsVerified = true;
    panel.observations[0].personalizationState = 'on';
    expect(scoreProspectVisibility(panel, 'secondcrew.com', NOW)).toMatchObject({ status: 'not_assessed', score: null });
    panel.observations[0].personalizationState = 'off';
    panel.queries[0].prompt = 'Should I hire Second Crew?';
    expect(scoreProspectVisibility(panel, 'secondcrew.com', NOW)).toMatchObject({ status: 'not_assessed', score: null });
  });
  it('rejects a citation recorded when no answer appeared', () => {
    const panel = completePanel();
    panel.observations[0].answerShown = false;
    expect(scoreProspectVisibility(panel, 'secondcrew.com', NOW)).toMatchObject({ status: 'not_assessed', score: null });
  });
});
