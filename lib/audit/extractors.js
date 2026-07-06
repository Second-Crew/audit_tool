import * as cheerio from 'cheerio';
import { getBotAccess } from './robots.js';

const PHONE_PATTERN = /(?:\+?1[-.\s]?)?(?:\(?\d{3}\)?[-.\s]?)\d{3}[-.\s]?\d{4}/g;
const EMAIL_PATTERN = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;

export function extractSiteSignals(crawl, input = {}) {
  const pages = crawl.pages.map((page) => extractPageSignals(page, input));
  const allText = pages.map((page) => page.text).join('\n').slice(0, 1_500_000);
  const schemaNodes = pages.flatMap((page) => page.schema.nodes.map((node) => ({ ...node, url: page.url })));
  const schemaTypes = Array.from(new Set(schemaNodes.flatMap((node) => normalizeTypeList(node.type))));
  const titles = pages.map((page) => page.title).filter(Boolean);
  const descriptions = pages.map((page) => page.metaDescription).filter(Boolean);
  const phones = Array.from(new Set(pages.flatMap((page) => page.contact.phones)));
  const emails = Array.from(new Set(pages.flatMap((page) => page.contact.emails)));
  const botAccess = getBotAccess(crawl.auxiliary.robots.body, crawl.origin);

  return {
    domain: crawl.domain,
    startUrl: crawl.startUrl,
    crawl: summarizeCrawl(crawl),
    pages,
    pageCount: pages.length,
    schema: summarizeSchema(schemaNodes, schemaTypes),
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
    commerce: summarizeCommerce(pages, schemaTypes, allText),
    saas: summarizeSaas(pages, allText),
    local: summarizeLocal(pages, allText, input, phones, emails),
    seo: summarizeSeo(pages, titles, descriptions),
    accessibility: summarizeAccessibility(pages),
    security: summarizeSecurity(crawl.pages[0] || null),
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
  const headings = {
    h1: $('h1').map((_, element) => normalizeText($(element).text())).get().filter(Boolean),
    h2: $('h2').map((_, element) => normalizeText($(element).text())).get().filter(Boolean),
    h3: $('h3').map((_, element) => normalizeText($(element).text())).get().filter(Boolean),
  };
  const text = normalizeText($('body').text()).slice(0, 250000);
  const links = $('a[href]').map((_, element) => $(element).attr('href') || '').get();
  const imageCount = $('img').length;
  const imagesWithAlt = $('img[alt]').filter((_, element) => normalizeText($(element).attr('alt') || '').length > 0).length;
  const inputs = $('input,textarea,select').length;
  const labels = $('label').length;
  const ariaLabels = $('[aria-label]').length;
  const hasLandmarks = /<(main|nav|header|footer|aside)\b/i.test(page.html || '') ||
    $('[role="main"],[role="navigation"],[role="banner"],[role="contentinfo"],[role="search"]').length > 0;
  const schema = extractJsonLd($, page.url);
  const hasVisibleFaq = detectFaq($, text);
  const contentType = inferPageType(page.url, title, headings, text);
  const sameAsLinks = links.filter((href) => /facebook|instagram|linkedin|youtube|x\.com|twitter|tiktok|yelp|g2|capterra|trustpilot|bbb\.org/i.test(href));
  const phones = Array.from(new Set(text.match(PHONE_PATTERN) || []));
  const emails = Array.from(new Set(text.match(EMAIL_PATTERN) || []));

  return {
    url: page.url,
    status: page.status,
    title,
    metaDescription,
    canonical,
    robotsMeta,
    indexable: !/noindex/i.test(robotsMeta),
    headings,
    text,
    contentType,
    schema,
    hasVisibleFaq,
    links,
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
      likelyLabeled: inputs === 0 || labels + ariaLabels >= Math.min(inputs, 1),
    },
    accessibility: {
      hasLandmarks,
    },
    technical: {
      truncated: page.truncated,
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
  if (!value) return [];
  if (Array.isArray(value)) return value.flatMap(flattenSchema);
  if (value['@graph']) return flattenSchema(value['@graph']);
  return [value];
}

function summarizeSchema(nodes, schemaTypes) {
  const hasAny = nodes.length > 0;
  const hasLocalBusiness = schemaTypes.some((type) => /LocalBusiness|Organization|ProfessionalService|Store|Restaurant|MedicalBusiness|LegalService/i.test(type));
  const hasFAQ = schemaTypes.some((type) => /FAQPage/i.test(type));
  const hasProduct = schemaTypes.some((type) => /Product|Offer|AggregateOffer/i.test(type));
  const hasService = schemaTypes.some((type) => /Service/i.test(type));
  const hasArticle = schemaTypes.some((type) => /Article|BlogPosting|NewsArticle/i.test(type));
  const hasBreadcrumb = schemaTypes.some((type) => /BreadcrumbList/i.test(type));
  const hasReview = schemaTypes.some((type) => /Review|AggregateRating/i.test(type));
  const invalidCount = nodes.filter((node) => node.invalid).length;

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
  const hasFreshnessSignals = /updated|last updated|2026|2025|current|latest|recent/i.test(allText);

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
  const trustPages = pages.filter((page) => /case|testimonial|review|customer|portfolio|press|award|certification|security|privacy/i.test(`${page.url} ${page.title}`));
  const sameAsLinks = Array.from(new Set(pages.flatMap((page) => page.sameAsLinks))).slice(0, 30);
  const hasAuthorSignals = /author|written by|reviewed by|founder|ceo|owner|expert|team/i.test(allText);
  const hasCredentials = /certified|licensed|insured|award|partner|accredited|years of experience|ISO|SOC 2|HIPAA|GDPR/i.test(allText);
  const hasCaseStudies = /case study|results|portfolio|customer story|testimonial/i.test(allText);

  return {
    companyName: input.companyName || null,
    aboutPage,
    contactPage,
    trustPages,
    sameAsLinks,
    hasAuthorSignals,
    hasCredentials,
    hasCaseStudies,
  };
}

function summarizeCommerce(pages, schemaTypes, allText) {
  return {
    likelyEcommerce: /cart|checkout|add to cart|shop|shipping|returns|sku|inventory/i.test(allText) || schemaTypes.some((type) => /Product|Offer/i.test(type)),
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
  const haystack = `${url} ${title} ${(headings.h1 || []).join(' ')} ${(headings.h2 || []).join(' ')} ${text.slice(0, 5000)}`;
  if (/contact|get-in-touch|schedule|book/i.test(haystack)) return 'contact';
  if (/about|our story|company|team/i.test(haystack)) return 'about';
  if (/pricing|plans/i.test(haystack)) return 'pricing';
  if (/docs|documentation|developer|api-reference|help-center/i.test(haystack)) return 'docs';
  if (/location|near-me|service-area|areas-we-serve/i.test(haystack)) return 'location';
  if (/product|shop|sku|add to cart/i.test(haystack)) return 'product';
  if (/service|solutions|what we do/i.test(haystack)) return 'service';
  if (/blog|article|guide|resource|learn|how-to|what-is/i.test(haystack)) return 'education';
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
