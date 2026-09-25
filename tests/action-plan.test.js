import { describe, expect, it } from 'vitest';
import { buildActionPlan } from '../lib/action-plan.js';

function page(index, overrides = {}) {
  return {
    url: `https://agency.example/blog/post-${index}`,
    status: 200,
    title: `Useful article ${index}`,
    metaDescription: `A summary of the article ${index}`,
    contentType: 'education',
    indexable: true,
    wordCount: 180,
    h1Count: 0,
    hasVisibleFaq: false,
    schemaCount: 0,
    imageCount: 2,
    imagesWithAlt: 2,
    ...overrides,
  };
}

describe('reviewable action plan', () => {
  it('does not turn sitewide schema absence and arbitrary word or heading thresholds into hundreds of page tasks', () => {
    const plan = buildActionPlan(
      { scores: { overall: 74 }, aiInsights: { roadmap: [{ title: 'Add testimonials', actions: ['Publish more reviews'] }] } },
      { pages: Array.from({ length: 56 }, (_, index) => page(index)) },
      { structuredData: { name: 'Structured Data', checks: [{ label: 'JSON-LD schema exists', status: 'failed', evidence: '0 schema nodes found' }] } },
      [{ id: 'schema', title: 'No structured data found', severity: 'medium', category: 'Structured Data', evidence: 'No JSON-LD observed', recommendation: 'Review accurate Organization facts.' }]
    );
    expect(plan).toMatchObject({ status: 'ready_for_review', totalTasks: 1, highImpactTasks: 0, pagePlans: [], categoryTasks: [] });
    expect(plan.generalTasks[0].title).toBe('No structured data found');
  });

  it('groups repeated checks and shows a bounded representative set of affected pages', () => {
    const plan = buildActionPlan(
      { scores: { overall: 50 } },
      { pages: Array.from({ length: 20 }, (_, index) => page(index, { title: '' })) },
      {
        security: { name: 'Security', checks: [
          { label: 'HSTS header present', status: 'failed', evidence: 'Missing' },
          { label: 'Content Security Policy present', status: 'failed', evidence: 'Missing' },
        ] },
        pageExperience: { name: 'Page Experience', checks: [
          { label: 'Mobile PageSpeed performance', status: 'partial', evidence: '54/100' },
          { label: 'Desktop PageSpeed performance', status: 'failed', evidence: '38/100' },
        ] },
      },
      []
    );
    expect(plan.categoryTasks).toHaveLength(2);
    expect(plan.categoryTasks.find(task => /security headers/i.test(task.title)).evidence).toContain('Content Security Policy');
    expect(plan.categoryTasks.find(task => /performance/i.test(task.title)).evidence).toContain('Desktop PageSpeed');
    expect(plan.pagePlans).toHaveLength(8);
    expect(plan.additionalPagesWithWork).toBe(12);
    expect(plan.pagePlans[0]).not.toHaveProperty('readiness');
    expect(plan.totalTasks).toBe(10);
    expect(plan.highImpactTasks).toBe(0);
  });
});
