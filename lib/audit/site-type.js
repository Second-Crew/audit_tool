export const WEBSITE_TYPES = ['auto', 'marketing', 'corporate', 'ecommerce'];
export const COMMERCE_MODES = ['auto', 'yes', 'no'];
export function resolveSiteType(pages, input = {}) {
  const type = WEBSITE_TYPES.includes(input.websiteType) ? input.websiteType : 'auto';
  const mode = COMMERCE_MODES.includes(input.ecommerceFunctionality) ? input.ecommerceFunctionality : 'auto';
  // A service description mentioning Shopify, shopping or returns is not a store.
  const evidence = pages.flatMap(page => (page.links || []).filter(href => {
    try { const link = new URL(href, page.url); return link.hostname === new URL(page.url).hostname && /^\/(cart|checkout|basket)(\/|$)/i.test(link.pathname); } catch { return false; }
  }).map(href => ({pageUrl:page.url, href})));
  const enabled = mode === 'yes' || (mode !== 'no' && type === 'ecommerce');
  return {value:type,source:type==='auto'?'unspecified':'caller',ecommerce:{applicable:enabled,status:mode==='no'?'not_applicable':enabled?'applicable':evidence.length?'needs_review':'unconfirmed',source:mode!=='auto'||type==='ecommerce'?'caller':'transaction_links',evidence}};
}
