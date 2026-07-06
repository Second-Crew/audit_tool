import * as cheerio from 'cheerio';
import { fetchText } from './fetcher.js';
import { canonicalizeUrl, getDomain, getOrigin, isSameSite, looksLikeHtmlPage, normalizeAuditUrl, toAbsoluteUrl } from './url.js';
import { parseRobotsTxt } from './robots.js';

const DEFAULT_LIMITS = {
  maxPages: 250,
  maxDurationMs: 240000,
  concurrency: 5,
  requestTimeoutMs: 10000,
  maxPageBytes: 900_000,
};

const PRIORITY_PATH_PATTERNS = [
  /\/$/,
  /about/i,
  /contact/i,
  /service/i,
  /solution/i,
  /product/i,
  /pricing/i,
  /faq/i,
  /location/i,
  /review/i,
  /testimonial/i,
  /case/i,
  /blog/i,
  /resource/i,
  /guide/i,
  /comparison/i,
  /integrations?/i,
  /docs?/i,
];

export async function crawlSite(inputUrl, limitOverrides = {}) {
  const limits = { ...DEFAULT_LIMITS, ...limitOverrides };
  const startUrl = normalizeAuditUrl(inputUrl);
  const origin = getOrigin(startUrl);
  const domain = getDomain(startUrl);
  const startedAt = Date.now();
  const deadline = startedAt + limits.maxDurationMs;

  const auxiliary = await fetchAuxiliaryFiles(origin, limits);
  const seedUrls = collectSeedUrls(startUrl, auxiliary);

  const queue = [];
  const queued = new Set();
  const visited = new Set();
  const pages = [];
  const errors = [];

  for (const url of seedUrls) {
    enqueue(url, queue, queued, startUrl);
  }

  async function worker() {
    while (Date.now() < deadline && pages.length < limits.maxPages) {
      const nextUrl = queue.shift();
      if (!nextUrl) return;
      if (visited.has(nextUrl)) continue;

      visited.add(nextUrl);

      const result = await fetchText(nextUrl, {
        timeoutMs: limits.requestTimeoutMs,
        maxBytes: limits.maxPageBytes,
      });

      if (!result.ok) {
        errors.push({ url: nextUrl, status: result.status, error: result.error || `HTTP ${result.status}` });
        continue;
      }

      const contentType = result.headers['content-type'] || '';
      if (!/html|xhtml/i.test(contentType) && !looksLikeHtmlPage(nextUrl)) {
        continue;
      }

      const page = {
        url: canonicalizeUrl(result.url || nextUrl),
        requestedUrl: nextUrl,
        status: result.status,
        headers: result.headers,
        html: result.body,
        truncated: result.truncated,
        discoveredLinks: [],
      };

      page.discoveredLinks = extractInternalLinks(page.html, page.url, startUrl);
      pages.push(page);

      for (const link of page.discoveredLinks) {
        if (pages.length + queue.length >= limits.maxPages * 4) break;
        enqueue(link, queue, queued, startUrl);
      }

      sortQueue(queue);
    }
  }

  await Promise.all(Array.from({ length: limits.concurrency }, () => worker()));

  return {
    domain,
    startUrl,
    origin,
    pages: pages.slice(0, limits.maxPages),
    auxiliary,
    errors,
    summary: {
      requestedMaxPages: limits.maxPages,
      crawledPages: pages.length,
      failedRequests: errors.length,
      elapsedMs: Date.now() - startedAt,
      stoppedBy: pages.length >= limits.maxPages ? 'page_limit' : Date.now() >= deadline ? 'time_limit' : 'queue_empty',
    },
  };
}

async function fetchAuxiliaryFiles(origin, limits) {
  const robotsUrl = `${origin}/robots.txt`;
  const llmsUrl = `${origin}/llms.txt`;
  const sitemapUrl = `${origin}/sitemap.xml`;

  const [robots, llms, sitemap] = await Promise.all([
    fetchText(robotsUrl, {
      timeoutMs: limits.requestTimeoutMs,
      maxBytes: 300_000,
      accept: 'text/plain,*/*;q=0.5',
    }),
    fetchText(llmsUrl, {
      timeoutMs: limits.requestTimeoutMs,
      maxBytes: 500_000,
      accept: 'text/plain,text/markdown,*/*;q=0.5',
    }),
    fetchText(sitemapUrl, {
      timeoutMs: limits.requestTimeoutMs,
      maxBytes: 1_200_000,
      accept: 'application/xml,text/xml,*/*;q=0.5',
    }),
  ]);

  const parsedRobots = robots.ok ? parseRobotsTxt(robots.body) : { groups: [], sitemaps: [] };
  const sitemapUrls = new Set(extractSitemapUrls(sitemap.ok ? sitemap.body : '', origin));

  for (const sitemapFromRobots of parsedRobots.sitemaps) {
    const response = await fetchText(sitemapFromRobots, {
      timeoutMs: limits.requestTimeoutMs,
      maxBytes: 1_200_000,
      accept: 'application/xml,text/xml,*/*;q=0.5',
    });
    if (response.ok) {
      extractSitemapUrls(response.body, origin).forEach((url) => sitemapUrls.add(url));
    }
  }

  return {
    robots: {
      url: robotsUrl,
      found: robots.ok,
      status: robots.status,
      body: robots.ok ? robots.body : '',
      parsed: parsedRobots,
    },
    llms: {
      url: llmsUrl,
      found: llms.ok,
      status: llms.status,
      body: llms.ok ? llms.body : '',
    },
    sitemap: {
      url: sitemapUrl,
      found: sitemap.ok || sitemapUrls.size > 0,
      status: sitemap.status,
      urls: Array.from(sitemapUrls),
    },
  };
}

function collectSeedUrls(startUrl, auxiliary) {
  const seedUrls = new Set([canonicalizeUrl(startUrl)]);
  const sitemapUrls = auxiliary.sitemap.urls || [];
  for (const url of sitemapUrls) {
    if (isSameSite(url, startUrl) && looksLikeHtmlPage(url)) seedUrls.add(canonicalizeUrl(url));
  }
  return Array.from(seedUrls).sort((a, b) => scoreUrlPriority(b) - scoreUrlPriority(a));
}

function enqueue(url, queue, queued, startUrl) {
  if (!url || queued.has(url)) return;
  if (!isSameSite(url, startUrl)) return;
  if (!looksLikeHtmlPage(url)) return;
  queued.add(url);
  queue.push(url);
}

function sortQueue(queue) {
  queue.sort((a, b) => scoreUrlPriority(b) - scoreUrlPriority(a));
}

function scoreUrlPriority(url) {
  const pathname = new URL(url).pathname;
  let score = 0;

  PRIORITY_PATH_PATTERNS.forEach((pattern, index) => {
    if (pattern.test(pathname)) score += 100 - index;
  });

  const depth = pathname.split('/').filter(Boolean).length;
  score -= depth * 3;
  if (pathname.length > 90) score -= 8;
  return score;
}

function extractInternalLinks(html, pageUrl, rootUrl) {
  const $ = cheerio.load(html || '');
  const links = new Set();

  $('a[href]').each((_, element) => {
    const absoluteUrl = toAbsoluteUrl($(element).attr('href'), pageUrl);
    if (absoluteUrl && isSameSite(absoluteUrl, rootUrl) && looksLikeHtmlPage(absoluteUrl)) {
      links.add(absoluteUrl);
    }
  });

  return Array.from(links);
}

function extractSitemapUrls(xml, origin) {
  const urls = new Set();
  if (!xml) return [];

  const locMatches = xml.match(/<loc>\s*([^<]+?)\s*<\/loc>/gi) || [];
  for (const match of locMatches) {
    const value = match.replace(/<\/?loc>/gi, '').trim();
    const absoluteUrl = toAbsoluteUrl(value, origin);
    if (absoluteUrl) urls.add(absoluteUrl);
  }

  return Array.from(urls);
}
