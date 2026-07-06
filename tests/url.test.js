import { describe, expect, it } from 'vitest';
import {
  assertPublicHttpUrl,
  canonicalizeUrl,
  getDomain,
  getOrigin,
  isSameSite,
  looksLikeHtmlPage,
  normalizeAuditUrl,
  toAbsoluteUrl,
} from '../lib/audit/url.js';

describe('normalizeAuditUrl', () => {
  it('adds https to bare domains', () => {
    expect(normalizeAuditUrl('example.com')).toBe('https://example.com/');
  });

  it('keeps an explicit protocol and strips the hash', () => {
    expect(normalizeAuditUrl('http://example.com/page#section')).toBe('http://example.com/page');
  });

  it('rejects empty and non-string input', () => {
    expect(() => normalizeAuditUrl('')).toThrow();
    expect(() => normalizeAuditUrl(null)).toThrow();
    expect(() => normalizeAuditUrl(42)).toThrow();
  });
});

describe('canonicalizeUrl', () => {
  it('removes tracking params and trailing slash', () => {
    expect(canonicalizeUrl('https://example.com/page/?utm_source=x&utm_medium=y&gclid=1'))
      .toBe('https://example.com/page');
  });

  it('keeps meaningful query params', () => {
    expect(canonicalizeUrl('https://example.com/search?q=turf')).toBe('https://example.com/search?q=turf');
  });
});

describe('getOrigin / getDomain', () => {
  it('extracts origin and www-stripped domain', () => {
    expect(getOrigin('https://www.example.com/page')).toBe('https://www.example.com');
    expect(getDomain('https://www.Example.com/page')).toBe('example.com');
  });
});

describe('isSameSite', () => {
  it('treats www and non-www as the same site', () => {
    expect(isSameSite('https://www.example.com/a', 'https://example.com')).toBe(true);
    expect(isSameSite('https://other.com/a', 'https://example.com')).toBe(false);
  });

  it('returns false for invalid URLs', () => {
    expect(isSameSite('not a url', 'https://example.com')).toBe(false);
  });
});

describe('toAbsoluteUrl', () => {
  it('resolves relative hrefs against the page URL', () => {
    expect(toAbsoluteUrl('/pricing', 'https://example.com/about')).toBe('https://example.com/pricing');
  });

  it('rejects mailto/tel/javascript and non-http links', () => {
    expect(toAbsoluteUrl('mailto:hi@example.com', 'https://example.com')).toBeNull();
    expect(toAbsoluteUrl('tel:+15551234567', 'https://example.com')).toBeNull();
    expect(toAbsoluteUrl('javascript:void(0)', 'https://example.com')).toBeNull();
  });
});

describe('looksLikeHtmlPage', () => {
  it('filters out obvious asset extensions', () => {
    expect(looksLikeHtmlPage('https://example.com/')).toBe(true);
    expect(looksLikeHtmlPage('https://example.com/guide')).toBe(true);
    expect(looksLikeHtmlPage('https://example.com/brochure.pdf')).toBe(false);
    expect(looksLikeHtmlPage('https://example.com/logo.svg')).toBe(false);
  });
});

describe('assertPublicHttpUrl', () => {
  it('rejects localhost and private IP addresses without DNS lookups', async () => {
    await expect(assertPublicHttpUrl('http://localhost:3000')).rejects.toThrow();
    await expect(assertPublicHttpUrl('http://127.0.0.1/')).rejects.toThrow();
    await expect(assertPublicHttpUrl('http://10.0.0.5/')).rejects.toThrow();
    await expect(assertPublicHttpUrl('http://192.168.1.1/')).rejects.toThrow();
    await expect(assertPublicHttpUrl('http://internal.local/')).rejects.toThrow();
  });

  it('rejects non-http protocols', async () => {
    await expect(assertPublicHttpUrl('ftp://example.com')).rejects.toThrow();
  });
});
