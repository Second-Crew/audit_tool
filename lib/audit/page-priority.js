// Top-level pages usually define the site's identity, offerings, or conversion
// path. A missing one can bias the audit even when most article pages succeed.
export function isCriticalPageUrl(url) {
  try {
    const segments = new URL(url).pathname.toLowerCase().split('/').filter(Boolean);
    if (segments.length === 0) return true;
    if (segments.length !== 1) return false;
    return !/^(?:blog|blogs|news|articles|guides|resources|tags?|categories|privacy|terms|legal|login|sign-in|search|feed|sitemap\.xml|robots\.txt|llms\.txt)$/.test(segments[0]);
  } catch {
    return false;
  }
}
