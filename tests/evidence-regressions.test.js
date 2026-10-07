import { describe,it,expect } from 'vitest';
import * as cheerio from 'cheerio';
import { cleanContent,indexingDirectives,labeledControls } from '../lib/audit/evidence.js';
import { getBotAccess } from '../lib/audit/robots.js';
import { isPrivateIp } from '../lib/audit/url.js';

describe('evidence regressions',()=>{
  it('ignores scripts, hidden content and navigation, while preserving word boundaries',()=>{
    const $=cheerio.load('<nav>Contact FAQ</nav><script>certified FAQ</script><main><h1>Plumbing</h1><p>Installation services.</p><div hidden>Fake reviews</div></main>');
    expect(cleanContent($)).toBe('Plumbing Installation services.');
  });
  it('respects HTTP noindex, none, duplicate meta tags and crawler scope',()=>{
    expect(indexingDirectives(cheerio.load(''),{'x-robots-tag':'noindex'}).indexAllowed).toBe(false);
    expect(indexingDirectives(cheerio.load('<meta name="robots" content="index"><meta name="robots" content="none">')).indexAllowed).toBe(false);
    expect(indexingDirectives(cheerio.load(''),{'x-robots-tag':'bingbot: noindex'}).indexAllowed).toBe(true);
    expect(indexingDirectives(cheerio.load(''),{'x-robots-tag':'googlebot: noindex, nofollow'}).indexAllowed).toBe(false);
  });
  it('unrelated aria labels cannot label form controls',()=>{
    expect(labeledControls(cheerio.load('<nav aria-label="menu"></nav><input><input><select></select>')).likelyLabeled).toBe(false);
    expect(labeledControls(cheerio.load('<label for="a">Email</label><input id="a"><input type="hidden"><textarea aria-label="Message"></textarea>')).likelyLabeled).toBe(true);
  });
  it('checks important paths and preserves failed robots uncertainty',()=>{
    const urls=['https://example.com/','https://example.com/services/plumbing'];
    expect(getBotAccess('User-agent: OAI-SearchBot\nDisallow: /services/','https://example.com',urls,200)['OAI-SearchBot'].allowed).toBe(false);
    expect(getBotAccess('','https://example.com',urls,503).Googlebot.allowed).toBeNull();
  });
  it('blocks mapped, metadata, unspecified and private network destinations',()=>{
    for(const ip of ['::','::1','::ffff:7f00:1','169.254.169.254','100.100.100.200','fe80::1','fc00::1','2001:db8::1']) expect(isPrivateIp(ip),ip).toBe(true);
    expect(isPrivateIp('93.184.215.14')).toBe(false);
    expect(isPrivateIp('2606:4700::1111')).toBe(false);
  });
});
