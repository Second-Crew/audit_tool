import * as cheerio from 'cheerio';
// Fetched HTML evidence, not a claim about rendered visibility.
export function cleanContent($) {
  $('script,style,template,noscript,[hidden],[aria-hidden="true"]').remove();
  $('[style]').each((_, el) => {
    if (/(?:display\s*:\s*none|visibility\s*:\s*hidden)/i.test($(el).attr('style') || '')) $(el).remove();
  });
  const copy = $.root().clone();
  copy.find('nav,header,footer,aside,[role="navigation"],[role="banner"],[role="contentinfo"]').remove();
  const main = copy.find('main,[role="main"]').first();
  const root = main.length ? main : copy.find('body');
  root.find('p,div,section,article,li,br,h1,h2,h3,h4,dt,dd,tr').prepend(' ').append(' ');
  return root.text().replace(/\s+/g, ' ').trim();
}
export function indexingDirectives($, headers = {}, crawler = 'googlebot') {
  crawler = crawler.toLowerCase();
  const sources = [];
  $('meta[name]').each((_, el) => {
    const name = ($(el).attr('name') || '').toLowerCase();
    if (name === 'robots' || name === crawler) sources.push({ source: `meta:${name}`, value: $(el).attr('content') || '' });
  });
  const header = Object.entries(headers).find(([key]) => key.toLowerCase() === 'x-robots-tag')?.[1];
  if (header) {
    for (const headerValue of (Array.isArray(header) ? header : [header])) {
      let agent = null;
      for (const token of String(headerValue).split(/,(?!\s*\d)/)) {
        const match = token.trim().match(/^([a-z*][\w-]*):\s*(.*)$/i);
        if (match && !['max-snippet', 'max-image-preview', 'max-video-preview', 'unavailable_after'].includes(match[1].toLowerCase())) {
          agent = match[1].toLowerCase();
          if (agent === crawler || agent === '*') sources.push({ source: 'header:x-robots-tag', value: match[2] });
        } else if (!agent || agent === crawler || agent === '*') sources.push({ source: 'header:x-robots-tag', value: token.trim() });
      }
    }
  }

  const value = sources.map(s => s.value.toLowerCase()).join(',');
  const tokens = value.split(/[\s,]+/);
  const limits = [...value.matchAll(/(?:^|[\s,])max-snippet\s*:\s*(-?\d+)(?=\s|,|$)/g)]
    .map(match => Number(match[1])).filter(limit => limit >= -1);
  const maxSnippet = limits.filter(limit => limit >= 0).length
    ? Math.min(...limits.filter(limit => limit >= 0)) : limits.length ? -1 : null;
  const expiryValues = sources.flatMap(s => [...s.value.matchAll(/unavailable_after\s*:\s*(.+)$/gi)].map(m => m[1]));
  const unavailableAfter = expiryValues.map(value => Date.parse(value)).filter(Number.isFinite);
  // data-nosnippet is a text-level restriction on supported elements, not noindex.
  const copy = $.root().clone();
  const exclusions = copy.find('div[data-nosnippet],span[data-nosnippet],section[data-nosnippet]');
  const partialExclusions = exclusions.length;
  exclusions.remove();
  const snippetTextLength = cleanContent(cheerio.load(copy.html())).length;
  return { crawler, indexAllowed: !tokens.some(t => t === 'noindex' || t === 'none'),
    snippetAllowed: !tokens.includes('nosnippet') && maxSnippet !== 0,
    maxSnippet, partialExclusions, snippetTextLength, unavailableAfter, sources };

}
export function labeledControls($) {
  const controls = $('input:not([type="hidden"]):not([type="submit"]):not([type="reset"]):not([type="button"]),textarea,select');
  let named = 0;
  controls.each((_, el) => {
    const node = $(el); const id = node.attr('id');
    const referenced = (node.attr('aria-labelledby') || '').split(/\s+/).filter(Boolean).map(ref => $('[id]').filter((_, n) => $(n).attr('id') === ref).text()).join(' ').trim();
    const explicit = id && $('label').filter((_, label) => $(label).attr('for') === id).text().trim();
    if (referenced || node.attr('aria-label')?.trim() || explicit || node.closest('label').text().trim() || node.attr('title')?.trim() || (node.attr('type') === 'image' && node.attr('alt')?.trim())) named++;
  });
  return { inputs: controls.length, named, likelyLabeled: named === controls.length };
}
