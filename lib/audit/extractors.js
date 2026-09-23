import { resolveSiteType } from './site-type.js';
import { createHash } from 'node:crypto';
import { cleanContent, indexingDirectives, labeledControls } from './evidence.js';
import * as cheerio from 'cheerio';
import { getBotAccess } from './robots.js';
import { canonicalizeUrl } from './url.js';
import { isCriticalPageUrl } from './page-priority.js';

const PHONE_PATTERN = /(?:\+?1[-.\s]?)?(?:\(?\d{3}\)?[-.\s]?)\d{3}[-.\s]?\d{4}/g;
const EMAIL_PATTERN = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;

// Mentions of the current or previous year count as freshness evidence.
export function buildFreshnessPattern(year = new Date().getFullYear()) {
  return new RegExp(`updated|last updated|\\b${year - 1}\\b|\\b${year}\\b|current|latest|recent`, 'i');
}

export function extractSiteSignals(crawl, input = {}) {
  const pages = crawl.pages.map((page) => extractPageSignals(page, input));
  const allText = pages.map((page) => page.text).join('\n').slice(0, 1_500_000);
  const schemaNodes = pages.flatMap((page) => page.schema.nodes.map((node) => ({ ...node, url: page.url })));
  const invalidSchemaBlocks = pages.flatMap((page) => page.schema.invalid);
  const schemaTypes = Array.from(new Set(schemaNodes.flatMap((node) => normalizeTypeList(node.type))));
  const titles = pages.map((page) => page.title).filter(Boolean);
  const descriptions = pages.map((page) => page.metaDescription).filter(Boolean);
  const phones = Array.from(new Set(pages.flatMap((page) => page.contact.phones)));
  const emails = Array.from(new Set(pages.flatMap((page) => page.contact.emails)));
  const botAccess = getBotAccess(crawl.auxiliary.robots.body, crawl.origin, pages.map(page => page.url), crawl.auxiliary.robots.status);

  return {
    domain: crawl.domain,
    startUrl: crawl.startUrl,
    crawl: summarizeCrawl(crawl),
    pages,
    pageCount: pages.length,
    schema: summarizeSchema(schemaNodes, schemaTypes, invalidSchemaBlocks),
    robots: {
      found: crawl.auxiliary.robots.found,
      botAccess,
      body: crawl.auxiliary.robots.body,
    },
    llms: {
      found: crawl.auxiliary.llms.found,
      url: crawl.auxiliary.llms.url,
      length: crawl.auxiliary.llms.body.length,
      hasUsefulContent: crawl.auxiliary.llms.body.length > 250,
    },
    sitemap: {
      found: crawl.auxiliary.sitemap.found,
      urlCount: crawl.auxiliary.sitemap.urls.length,
    },
    content: summarizeContent(pages, allText, input),
    entity: summarizeEntity(pages, allText, input),
    siteType: resolveSiteType(pages, input),
    contentEvidence: summarizeContentEvidence(pages),
    commerce: summarizeCommerce(pages, schemaTypes, allText, input),
    saas: summarizeSaas(pages, allText),
    local: summarizeLocal(pages, allText, input, phones, emails),
    seo: summarizeSeo(pages, titles, descriptions),
    accessibility: summarizeAccessibility(pages),
    security: summarizeSecurity(findHomePage(crawl)),
    rawTextSample: allText.slice(0, 15000),
  };
}

function summarizeCrawl(crawl) {
  return {
    domain: crawl.domain,
    startUrl: crawl.startUrl,
    origin: crawl.origin,
    summary: crawl.summary,
    errors: crawl.errors.slice(0, 50),
    auxiliary: {
      robots: {
        found: crawl.auxiliary.robots.found,
        status: crawl.auxiliary.robots.status,
        url: crawl.auxiliary.robots.url,
      },
      llms: {
        found: crawl.auxiliary.llms.found,
        status: crawl.auxiliary.llms.status,
        url: crawl.auxiliary.llms.url,
      },
      sitemap: {
        found: crawl.auxiliary.sitemap.found,
        status: crawl.auxiliary.sitemap.status,
        url: crawl.auxiliary.sitemap.url,
        urlCount: crawl.auxiliary.sitemap.urls.length,
      },
    },
  };
}

function extractPageSignals(page, input) {
  const $ = cheerio.load(page.html || '');
  const title = normalizeText($('title').first().text());
  const metaDescription = normalizeText($('meta[name="description" i]').attr('content') || '');
  const canonical = $('link[rel="canonical" i]').attr('href') || null;
  const robotsMeta = $('meta[name="robots" i]').attr('content') || '';
  const schema = extractJsonLd($, page.url);
  const directives = indexingDirectives($, page.headers);
  const text = cleanContent($).slice(0, 250000);
  const headings = {
    h1: $('h1').map((_, element) => normalizeText($(element).text())).get().filter(Boolean),
    h2: $('h2').map((_, element) => normalizeText($(element).text())).get().filter(Boolean),
    h3: $('h3').map((_, element) => normalizeText($(element).text())).get().filter(Boolean),
  };
  const links = $('a[href]').map((_, element) => $(element).attr('href') || '').get();
  const contactRoutes = $('a[href]').map((_, element) => {
    const href = $(element).attr('href') || '';
    const label = normalizeText($(element).text() || $(element).attr('aria-label') || '');
    if (!/\b(contact(?: us)?|get in touch|request (?:a )?(?:proposal|quote)|book (?:a )?(?:call|meeting)|schedule (?:a )?(?:call|meeting)|talk to (?:us|sales))\b/i.test(label)) return null;
    try {
      const target = new URL(href, page.url);
      if (!['http:', 'https:'].includes(target.protocol)) return null;
      const source = new URL(page.url);
      const sameSite = target.hostname === source.hostname || target.hostname.replace(/^www\./, '') === source.hostname.replace(/^www\./, '');
      const knownFormHost = /(?:^|\.)(?:typeform\.com|calendly\.com|jotform\.com|tally\.so|fillout\.com)$/.test(target.hostname.toLowerCase()) || /^meetings\.hubspot\.com$/.test(target.hostname.toLowerCase());
      if (!sameSite && !knownFormHost) return null;
      return { url: target.href, label, sourcePageUrl: page.url };
    } catch { return null; }
  }).get();
  const imageCount = $('img').length;
  const imagesWithAlt = $('img[alt]').length;
  const inputs = $('input,textarea,select').length;
  const labels = $('label').length;
  const ariaLabels = $('[aria-label]').length;
  const hasLandmarks = /<(main|nav|header|footer|aside)\b/i.test(page.html || '') ||
    $('[role="main"],[role="navigation"],[role="banner"],[role="contentinfo"],[role="search"]').length > 0;
  const forms = labeledControls($);
  const hasVisibleFaq = detectFaq($, text);
  const contentType = inferPageType(page.url, title, headings, text);
  const sameAsLinks = links.filter((href) => /facebook|instagram|linkedin|youtube|x\.com|twitter|tiktok|yelp|g2|capterra|trustpilot|bbb\.org/i.test(href));
  const phones = Array.from(new Set(text.match(PHONE_PATTERN) || []));
  const emails = Array.from(new Set(text.match(EMAIL_PATTERN) || []));

  return {
    url: page.url,
    requestedUrl: page.requestedUrl || page.url,
    observedAt: page.observedAt || null,
    sourceHash: createHash('sha256').update(page.html || '').digest('hex'),
    evidenceSource: page.rendered ? 'rendered_dom' : 'fetched_html',
    status: page.status,
    title,
    metaDescription,
    canonical,
    robotsMeta,
    indexable: directives.indexAllowed,
    indexing: directives,
    headings,
    text,
    contentType,
    schema,
    hasVisibleFaq,
    links,
    contactRoutes,
    sameAsLinks,
    contact: {
      phones,
      emails,
      hasForm: $('form').length > 0,
      hasTelLink: $('a[href^="tel:"]').length > 0,
      hasMailLink: $('a[href^="mailto:"]').length > 0,
    },
    media: {
      imageCount,
      imagesWithAlt,
      altRatio: imageCount ? imagesWithAlt / imageCount : 1,
    },
    forms: {
      inputs,
      labels,
      ariaLabels,
      ...forms,
    },
    accessibility: {
      hasLandmarks,
    },
    technical: {
      truncated: page.truncated,
      rendered: Boolean(page.rendered),
      renderStatus: page.renderStatus || null,
      wordCount: text.split(/\s+/).filter(Boolean).length,
      contentType: page.headers?.['content-type'] || '',
    },
  };
}

function extractJsonLd($, url) {
  const nodes = [];
  const invalid = [];

  $('script[type="application/ld+json" i]').each((_, element) => {
    const raw = $(element).contents().text().trim();
    if (!raw) return;

    try {
      flattenSchema(JSON.parse(raw)).forEach((node) => {
        nodes.push({
          type: node['@type'] || 'Unknown',
          id: node['@id'] || null,
          name: node.name || node.legalName || node.headline || null,
          raw: shrinkObject(node),
        });
      });
    } catch (error) {
      invalid.push({ url, message: error.message, sample: raw.slice(0, 180) });
    }
  });

  return {
    found: nodes.length > 0,
    count: nodes.length,
    nodes,
    invalid,
  };
}

function flattenSchema(value) {
  if (!value || typeof value !== 'object') return [];
  if (Array.isArray(value)) return value.flatMap(flattenSchema);
  return [...(value['@type'] ? [value] : []), ...Object.values(value).filter(v => v && typeof v === 'object').flatMap(flattenSchema)];
}

function summarizeSchema(nodes, schemaTypes, invalidBlocks = []) {
  const hasAny = nodes.length > 0;
  const hasLocalBusiness = schemaTypes.some((type) => /LocalBusiness|Organization|ProfessionalService|Store|Restaurant|MedicalBusiness|LegalService/i.test(type));
  const hasFAQ = schemaTypes.some((type) => /FAQPage/i.test(type));
  const hasProduct = schemaTypes.some((type) => /Product|Offer|AggregateOffer/i.test(type));
  const hasService = schemaTypes.some((type) => /Service/i.test(type));
  const hasArticle = schemaTypes.some((type) => /Article|BlogPosting|NewsArticle/i.test(type));
  const hasBreadcrumb = schemaTypes.some((type) => /BreadcrumbList/i.test(type));
  const hasReview = schemaTypes.some((type) => /Review|AggregateRating/i.test(type));
  const invalidCount = invalidBlocks.length;

  return {
    found: hasAny,
    count: nodes.length,
    types: schemaTypes,
    nodes,
    hasLocalBusiness,
    hasFAQ,
    hasProduct,
    hasService,
    hasArticle,
    hasBreadcrumb,
    hasReview,
    invalidCount,
    invalidBlocks: invalidBlocks.slice(0, 20),
  };
}

function summarizeContent(pages, allText, input) {
  const faqPages = pages.filter((page) => page.hasVisibleFaq || /faq/i.test(page.url));
  const servicePages = pages.filter((page) => page.contentType === 'service');
  const productPages = pages.filter((page) => page.contentType === 'product');
  const locationPages = pages.filter((page) => page.contentType === 'location');
  const comparisonPages = pages.filter((page) => /compare|comparison|versus|\bvs\b|alternative/i.test(`${page.url} ${page.title} ${page.text}`));
  const educationalPages = pages.filter((page) => page.contentType === 'education');
  const hasDirectAnswers = /(?:we are|we provide|we offer|we specialize|our services include|the best way to|how to|what is|how much|how long)/i.test(allText);
  const hasProcess = /our process|how it works|how we work|step \d|step-by-step|methodology|implementation process/i.test(allText);
  const hasPricing = /pricing|plans|price|cost|quote|estimate|subscription|per month|per year/i.test(allText);
  const hasFreshnessSignals = buildFreshnessPattern().test(allText);

  return {
    faqPages,
    servicePages,
    productPages,
    locationPages,
    comparisonPages,
    educationalPages,
    hasDirectAnswers,
    hasProcess,
    hasPricing,
    hasFreshnessSignals,
    topicalDepth: servicePages.length + productPages.length + educationalPages.length + comparisonPages.length,
    representativeUrls: pages.slice(0, 12).map((page) => page.url),
  };
}

function summarizeEntity(pages, allText, input) {
  const aboutPage = pages.find((page) => page.contentType === 'about');
  const contactPage = pages.find((page) => page.contentType === 'contact');
  const contactRoute = contactPage ? {url:contactPage.url,label:'Contact page',sourcePageUrl:contactPage.url} : pages.flatMap(page=>page.contactRoutes || [])[0] || null;
  const trustPages = pages.filter((page) => /case|testimonial|review|customer|portfolio|press|award|certification|security|privacy/i.test(`${page.url} ${page.title}`));
  const sameAsLinks = Array.from(new Set(pages.flatMap((page) => page.sameAsLinks))).slice(0, 30);
  const hasAuthorSignals = /author|written by|reviewed by|founder|ceo|owner|expert|team/i.test(allText);
  const hasCredentials = /certified|licensed|insured|award|partner|accredited|years of experience|ISO|SOC 2|HIPAA|GDPR/i.test(allText);
  const hasCaseStudies = /case study|results|portfolio|customer story|testimonial/i.test(allText);

  return {
    companyName: input.companyName || null,
    aboutPage,
    contactPage,
    contactRoute,
    trustPages,
    sameAsLinks,
    hasAuthorSignals,
    hasCredentials,
    hasCaseStudies,
  };
}

function summarizeCommerce(pages, schemaTypes, allText, input) {
  return {
    likelyEcommerce: resolveSiteType(pages, input).ecommerce.applicable,
    hasProductSchema: schemaTypes.some((type) => /Product/i.test(type)),
    hasOfferSchema: schemaTypes.some((type) => /Offer/i.test(type)),
    hasReviews: /review|rating|stars/i.test(allText) || schemaTypes.some((type) => /Review|AggregateRating/i.test(type)),
    hasShippingReturns: /shipping|returns|refund|delivery/i.test(allText),
    productPageCount: pages.filter((page) => page.contentType === 'product').length,
  };
}

function summarizeSaas(pages, allText) {
  return {
    likelySaas: /software|platform|SaaS|dashboard|API|integrations|subscription|demo|free trial/i.test(allText),
    hasPricingPage: pages.some((page) => page.contentType === 'pricing'),
    hasDocs: pages.some((page) => page.contentType === 'docs'),
    hasIntegrations: /integrations?|connectors?|zapier|slack|salesforce|hubspot/i.test(allText),
    hasSecurityTrust: /security|SOC 2|ISO 27001|SSO|SAML|GDPR|HIPAA|privacy/i.test(allText),
    hasCaseStudies: pages.some((page) => /case-study|case-studies|customers/i.test(page.url)),
  };
}

function summarizeLocal(pages, allText, input, phones, emails) {
  const city = input.city || '';
  const cityMentioned = city ? new RegExp(escapeRegExp(city), 'i').test(allText) : false;

  return {
    city,
    cityMentioned,
    phones,
    emails,
    hasAddress: /\d+\s+[a-z0-9 .'-]+(?:street|st|avenue|ave|road|rd|drive|dr|boulevard|blvd|lane|ln|suite|ste)\b/i.test(allText),
    hasHours: /hours|open monday|mon(?:day)?\s*-|24\/7|open 24/i.test(allText),
    hasServiceArea: /service area|serving|nearby|surrounding areas|local/i.test(allText),
    locationPageCount: pages.filter((page) => page.contentType === 'location').length,
  };
}

function summarizeSeo(pages, titles, descriptions) {
  const indexablePages = pages.filter((page) => page.indexable);
  const missingTitles = pages.filter((page) => !page.title);
  const missingDescriptions = pages.filter((page) => !page.metaDescription);
  const duplicateTitles = countDuplicates(titles);
  const duplicateDescriptions = countDuplicates(descriptions);
  const pagesWithOneH1 = pages.filter((page) => page.headings.h1.length === 1);

  return {
    indexablePages: indexablePages.length,
    noindexPages: pages.length - indexablePages.length,
    missingTitles,
    missingDescriptions,
    duplicateTitleCount: duplicateTitles,
    duplicateDescriptionCount: duplicateDescriptions,
    pagesWithOneH1: pagesWithOneH1.length,
    titleCoverage: pages.length ? (pages.length - missingTitles.length) / pages.length : 0,
    descriptionCoverage: pages.length ? (pages.length - missingDescriptions.length) / pages.length : 0,
    h1Coverage: pages.length ? pagesWithOneH1.length / pages.length : 0,
  };
}

function summarizeAccessibility(pages) {
  const altRatios = pages.map((page) => page.media.altRatio);
  const formPasses = pages.filter((page) => page.forms.likelyLabeled).length;
  const averageAltRatio = altRatios.length ? altRatios.reduce((sum, value) => sum + value, 0) / altRatios.length : 1;
  const pagesWithLandmarks = pages.filter((page) => page.accessibility.hasLandmarks).length;

  return {
    averageAltRatio,
    formLabelCoverage: pages.length ? formPasses / pages.length : 1,
    pagesWithLandmarks,
  };
}

function findHomePage(crawl) {
  const target = canonicalizeUrl(crawl.startUrl);
  return (
    crawl.pages.find((page) => page.url === target || page.requestedUrl === target) ||
    crawl.pages.find((page) => {
      try {
        return new URL(page.url).pathname === '/';
      } catch {
        return false;
      }
    }) ||
    crawl.pages[0] ||
    null
  );
}

function summarizeSecurity(homePage) {
  const headers = homePage?.headers || {};
  return {
    hasHttps: homePage?.url?.startsWith('https://') || false,
    hasHsts: Boolean(headers['strict-transport-security']),
    hasCsp: Boolean(headers['content-security-policy']),
    hasFrameProtection: Boolean(headers['x-frame-options'] || headers['content-security-policy']?.includes('frame-ancestors')),
    hasNosniff: headers['x-content-type-options'] === 'nosniff',
    hasReferrerPolicy: Boolean(headers['referrer-policy']),
  };
}

function detectFaq($, text) {
  if (/frequently asked|faq|questions and answers|\bq&a\b/i.test(text)) return true;
  if ($('[class*="faq" i], [id*="faq" i]').length > 0) return true;
  const questionHeadings = $('h2,h3,h4,dt').filter((_, element) => /\?$/.test(normalizeText($(element).text()))).length;
  return questionHeadings >= 2;
}

function inferPageType(url, title, headings, text) {
  const pathname = new URL(url).pathname;
  const segments = pathname.toLowerCase().split('/').filter(Boolean);
  const section = segments[0] || '';
  // A blog post or portfolio item can mention services without being a service
  // landing page. URL sections are stronger evidence than copied page copy.
  if (/^(?:blog|blogs|articles|guides|resources|news)$/.test(section)) return 'education';
  if (segments.some((segment) => /^(?:portfolio|case-studies|case-study|projects)$/.test(segment)) || /^(?:work|our-clients)$/.test(section)) return 'case_study';
  const rules = [
    ['product', /\bproducts?\b|add to cart|\bsku\b/i],
    ['service', /\bservices?\b|\bsolutions?\b|what we do/i],
    ['contact', /\bcontact\b|get-in-touch|book an appointment/i],
    ['about', /\babout\b|our story|our team/i],
    ['pricing', /\bpricing\b|\bplans\b/i],
    ['docs', /\bdocs\b|documentation|api-reference|help-center/i],
    ['location', /\blocations?\b|service-area|areas-we-serve/i],
    ['education', /\bblog\b|\barticle\b|\bguide\b|\bresource\b|how-to|what-is/i],
  ];
  for (const field of [pathname, (headings.h1 || []).join(' '), title]) {
    const matches = rules.filter(([, pattern]) => pattern.test(field));
    if (matches.length === 1) return matches[0][0];
  }
  // Some sites name a service page for the actual work (for example,
  // /web-design) instead of using /services. Require an offer signal in the
  // visible page text as well as a service topic in the page heading/title.
  const heading = `${(headings.h1 || []).join(' ')} ${title}`;
  const serviceTopic = /\b(?:design|development|marketing|consulting|installation|repair|support|management|strategy|training|implementation|plumbing|roofing|landscaping)\b/i;
  const offerSignal = /\b(?:our (?:process|approach|services|capabilities)|we (?:build|design|develop|provide|offer|help)|request (?:a |your )?proposal|book (?:a )?consultation)\b/i;
  if (segments.length === 1 && serviceTopic.test(heading) && offerSignal.test(text)) return 'service';
  return 'general';
}

function normalizeText(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function normalizeTypeList(type) {
  if (!type) return [];
  return Array.isArray(type) ? type.map(String) : [String(type)];
}

function countDuplicates(values) {
  const counts = new Map();
  for (const value of values) {
    const normalized = value.toLowerCase();
    counts.set(normalized, (counts.get(normalized) || 0) + 1);
  }
  return Array.from(counts.values()).filter((count) => count > 1).length;
}

function shrinkObject(value) {
  try {
    return JSON.parse(JSON.stringify(value).slice(0, 8000));
  } catch {
    return {};
  }
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function summarizeContentEvidence(pages) {
  const sparse=pages.filter(page=>page.text.length<80);
  const rendered=pages.filter(page=>page.technical.rendered);
  const coverage=pages.length?(pages.length-sparse.length)/pages.length:0;
  const criticalSparseUrls=sparse.filter(page=>isCriticalPageUrl(page.url)).map(page=>page.url);
  const status=coverage>=0.8 && criticalSparseUrls.length===0?'sufficient':'incomplete';
  return {pages:pages.length,usablePages:pages.length-sparse.length,sparsePages:sparse.length,renderedPages:rendered.length,coverage,
    criticalSparseUrls,status,
    limitation:criticalSparseUrls.length
      ? `Core page content could not be assessed: ${criticalSparseUrls.slice(0,3).join(', ')}${criticalSparseUrls.length>3?' and more':''}.`
      : status==='incomplete'?'More than 20% of sampled pages returned too little extractable content; JavaScript rendering may be required.':null};
}
