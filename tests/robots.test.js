import { describe, expect, it } from 'vitest';
import { isAllowedByRobots, parseRobotsTxt } from '../lib/audit/robots.js';

describe('parseRobotsTxt', () => {
  it('parses groups, rules, and sitemaps', () => {
    const parsed = parseRobotsTxt([
      'User-agent: Googlebot',
      'Disallow: /private',
      'Allow: /private/ok',
      '',
      'Sitemap: https://example.com/sitemap.xml',
    ].join('\n'));

    expect(parsed.groups).toHaveLength(1);
    expect(parsed.groups[0].agents).toEqual(['googlebot']);
    expect(parsed.groups[0].rules).toEqual([
      { type: 'disallow', path: '/private' },
      { type: 'allow', path: '/private/ok' },
    ]);
    expect(parsed.sitemaps).toEqual(['https://example.com/sitemap.xml']);
  });

  it('shares one rule group across consecutive user-agent lines', () => {
    const parsed = parseRobotsTxt([
      'User-agent: GPTBot',
      'User-agent: ClaudeBot',
      'Disallow: /',
    ].join('\n'));

    expect(parsed.groups).toHaveLength(1);
    expect(parsed.groups[0].agents).toEqual(['gptbot', 'claudebot']);
    expect(parsed.groups[0].rules).toEqual([{ type: 'disallow', path: '/' }]);
  });

  it('starts a new group when user-agent follows rules', () => {
    const parsed = parseRobotsTxt([
      'User-agent: *',
      'Disallow: /a',
      'User-agent: Googlebot',
      'Disallow: /b',
    ].join('\n'));

    expect(parsed.groups).toHaveLength(2);
    expect(parsed.groups[1].agents).toEqual(['googlebot']);
  });

  it('strips comments and ignores empty disallow values', () => {
    const parsed = parseRobotsTxt([
      'User-agent: * # everyone',
      'Disallow: # allow everything',
      'Disallow: /admin # hidden',
    ].join('\n'));

    expect(parsed.groups[0].rules).toEqual([{ type: 'disallow', path: '/admin' }]);
  });
});

describe('isAllowedByRobots', () => {
  const parse = (lines) => parseRobotsTxt(lines.join('\n'));

  it('allows everything when no groups match', () => {
    expect(isAllowedByRobots({ groups: [], sitemaps: [] }, 'Googlebot', '/any')).toBe(true);
  });

  it('applies wildcard group disallow rules', () => {
    const parsed = parse(['User-agent: *', 'Disallow: /admin']);
    expect(isAllowedByRobots(parsed, 'SecondCrewAuditBot', '/admin/settings')).toBe(false);
    expect(isAllowedByRobots(parsed, 'SecondCrewAuditBot', '/about')).toBe(true);
  });

  it('prefers the most specific matching agent group', () => {
    const parsed = parse([
      'User-agent: *',
      'Disallow: /',
      'User-agent: Googlebot',
      'Allow: /',
    ]);
    expect(isAllowedByRobots(parsed, 'Googlebot', '/page')).toBe(true);
    expect(isAllowedByRobots(parsed, 'PerplexityBot', '/page')).toBe(false);
  });

  it('matches crawler names that start with the robots.txt token', () => {
    const parsed = parse(['User-agent: SecondCrewAuditBot', 'Disallow: /internal']);
    expect(isAllowedByRobots(parsed, 'SecondCrewAuditBot', '/internal/report')).toBe(false);
    expect(isAllowedByRobots(parsed, 'SecondCrewAuditBot', '/public')).toBe(true);
  });

  it('lets the longest (most specific) rule win, with allow beating disallow on ties', () => {
    const parsed = parse([
      'User-agent: *',
      'Disallow: /shop',
      'Allow: /shop/guides',
    ]);
    expect(isAllowedByRobots(parsed, 'Googlebot', '/shop/cart')).toBe(false);
    expect(isAllowedByRobots(parsed, 'Googlebot', '/shop/guides/turf')).toBe(true);
  });

  it('supports * wildcards and $ anchors in rule paths', () => {
    const parsed = parse([
      'User-agent: *',
      'Disallow: /*.pdf$',
      'Disallow: /search*results',
    ]);
    expect(isAllowedByRobots(parsed, 'Googlebot', '/files/brochure.pdf')).toBe(false);
    expect(isAllowedByRobots(parsed, 'Googlebot', '/files/brochure.pdf?download=1')).toBe(true);
    expect(isAllowedByRobots(parsed, 'Googlebot', '/search/all/results')).toBe(false);
  });
});
