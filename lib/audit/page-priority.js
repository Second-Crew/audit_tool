// Top-level pages usually define the site's identity, offerings, or conversion
// path. A missing one can bias the audit even when most article pages succeed.
export function isCriticalPageUrl(url) {
  try {
    const segments = new URL(url).pathname.toLowerCase().split('/').filter(Boolean);
    if (segments.length === 0) return true;
    if (segments.length !== 1) return false;
    // Transaction/session pages can legitimately contain little text (for
    // example, an empty cart). Keep them in coverage, but do not let one empty
    // utility page invalidate otherwise usable catalog and company evidence.
    return !/^(?:cart|checkout|basket|account|login|sign-in|register|search|blog|blogs|news|articles|guides|resources|tags?|categories|privacy|terms|legal|feed|sitemap\.xml|robots\.txt|llms\.txt)$/.test(segments[0]);
  } catch {
    return false;
  }
}
