import { describe, expect, it } from 'vitest';
import { buildComparisonChartSvg } from '../lib/comparison-chart.js';

const scores = (base) => ({
  overall: base,
  aeoGeo: base + 5,
  crawlability: base - 5,
  structuredData: base,
  answerReadiness: base + 10,
  entityTrust: base - 10,
  seo: base,
});

describe('buildComparisonChartSvg', () => {
  it('renders one line per site plus a legend', () => {
    const svg = buildComparisonChartSvg({
      primaryName: 'Example Co',
      primaryScores: scores(60),
      competitors: [
        { name: 'Rival One', domain: 'rival-one.com', scores: scores(45) },
        { name: 'Rival Two', domain: 'rival-two.com', scores: scores(75) },
      ],
    });

    expect(svg).toContain('<svg');
    expect((svg.match(/<polyline/g) || []).length).toBe(3);
    expect(svg).toContain('Example Co (you)');
    expect(svg).toContain('Rival One');
    expect(svg).toContain('Rival Two');
    expect(svg).toContain('GEO/AEO');
  });

  it('excludes failed competitors and returns empty with none left', () => {
    const failedOnly = buildComparisonChartSvg({
      primaryName: 'Example Co',
      primaryScores: scores(60),
      competitors: [{ name: 'Broken', domain: 'broken.example', error: 'Crawl failed', scores: null }],
    });
    expect(failedOnly).toBe('');

    const mixed = buildComparisonChartSvg({
      primaryName: 'Example Co',
      primaryScores: scores(60),
      competitors: [
        { name: 'Broken', domain: 'broken.example', error: 'Crawl failed', scores: null },
        { name: 'Rival', domain: 'rival.com', scores: scores(50) },
      ],
    });
    expect((mixed.match(/<polyline/g) || []).length).toBe(2);
    expect(mixed).not.toContain('Broken');
  });

  it('returns empty without primary scores or competitors', () => {
    expect(buildComparisonChartSvg({ primaryName: 'X', primaryScores: null, competitors: [] })).toBe('');
    expect(buildComparisonChartSvg({ primaryName: 'X', primaryScores: scores(50), competitors: [] })).toBe('');
  });

  it('escapes markup in competitor names', () => {
    const svg = buildComparisonChartSvg({
      primaryName: '<script>alert(1)</script>',
      primaryScores: scores(60),
      competitors: [{ name: 'A & B "Turf"', domain: 'ab.com', scores: scores(40) }],
    });
    expect(svg).not.toContain('<script>');
    expect(svg).toContain('&lt;script&gt;');
    expect(svg).toContain('A &amp; B &quot;Turf&quot;');
  });
});
