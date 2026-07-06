export function scoreSite(signals, pageSpeed = { scores: {}, metrics: {}, available: false }) {
  const findings = [];
  const categoryDetails = {};

  const crawl = scoreCrawlability(signals, findings);
  const schema = scoreStructuredData(signals, findings);
  const content = scoreAnswerReadiness(signals, findings);
  const entity = scoreEntityTrust(signals, findings);
  const seo = scoreTechnicalSeo(signals, findings);
  const experience = scorePageExperience(signals, pageSpeed, findings);
  const vertical = scoreVerticalReadiness(signals, findings);
  const security = scoreSecurity(signals, findings);
  const accessibility = scoreAccessibility(signals, pageSpeed, findings);

  categoryDetails.crawlability = crawl;
  categoryDetails.structuredData = schema;
  categoryDetails.answerReadiness = content;
  categoryDetails.entityTrust = entity;
  categoryDetails.technicalSeo = seo;
  categoryDetails.pageExperience = experience;
  categoryDetails.verticalReadiness = vertical;
  categoryDetails.security = security;
  categoryDetails.accessibility = accessibility;

  const overall = Math.round(
    crawl.score * 0.15 +
      schema.score * 0.15 +
      content.score * 0.2 +
      entity.score * 0.15 +
      seo.score * 0.15 +
      experience.score * 0.1 +
      vertical.score * 0.1
  );

  const aeoGeo = Math.round(
    crawl.score * 0.18 +
      schema.score * 0.22 +
      content.score * 0.25 +
      entity.score * 0.2 +
      vertical.score * 0.15
  );

  const seoComposite = Math.round(seo.score * 0.55 + crawl.score * 0.2 + schema.score * 0.15 + experience.score * 0.1);
  const aiReadiness = Math.round(aeoGeo * 0.75 + entity.score * 0.15 + crawl.score * 0.1);

  return {
    scores: {
      overall,
      aeoGeo,
      aiReadiness,
      seo: seoComposite,
      crawlability: crawl.score,
      structuredData: schema.score,
      answerReadiness: content.score,
      entityTrust: entity.score,
      verticalReadiness: vertical.score,
      pageExperience: experience.score,
      security: security.score,
      accessibility: accessibility.score,
      mobile: pageSpeed.scores?.mobile,
      desktop: pageSpeed.scores?.desktop,
    },
    categoryDetails,
    findings: findings.sort((a, b) => severityWeight(b.severity) - severityWeight(a.severity)),
  };
}

export function compareCompetitors(primary, competitors) {
  return competitors.map((competitor) => {
    // Failed crawls stay in the comparison so the UI can surface them
    // instead of silently dropping the submitted competitor.
    if (competitor.error || !competitor.signals?.schema) {
      return {
        name: competitor.input.name || competitor.signals?.domain || competitor.input.url,
        url: competitor.signals?.startUrl || competitor.input.url,
        domain: competitor.signals?.domain || competitor.input.url,
        error: competitor.error || 'The crawl returned no usable pages',
        scores: null,
        scoreDiff: null,
        gaps: [],
        advantages: [],
        crawledPages: competitor.signals?.pageCount || 0,
      };
    }

    const advantages = [];
    const gaps = [];
    const scoreDiff = (competitor.scoring.scores.aeoGeo || 0) - (primary.scoring.scores.aeoGeo || 0);

    compareSignal('Schema coverage', primary.signals.schema.count, competitor.signals.schema.count, gaps, advantages);
    compareSignal('FAQ pages', primary.signals.content.faqPages.length, competitor.signals.content.faqPages.length, gaps, advantages);
    compareSignal('Topical depth', primary.signals.content.topicalDepth, competitor.signals.content.topicalDepth, gaps, advantages);
    compareSignal('Trust pages', primary.signals.entity.trustPages.length, competitor.signals.entity.trustPages.length, gaps, advantages);

    return {
      name: competitor.input.name || competitor.signals.domain,
      url: competitor.signals.startUrl,
      domain: competitor.signals.domain,
      scores: competitor.scoring.scores,
      scoreDiff,
      gaps,
      advantages,
      crawledPages: competitor.signals.pageCount,
    };
  });
}

function scoreCrawlability(signals, findings) {
  const checks = [];
  let points = 0;

  points += addCheck(checks, signals.pageCount >= 10, 12, 'Crawled enough pages for a site-level read', `${signals.pageCount} pages crawled`);
  points += addCheck(checks, signals.sitemap.found, 14, 'XML sitemap is available', `${signals.sitemap.urlCount} sitemap URLs found`);
  points += addCheck(checks, signals.robots.found, 8, 'robots.txt is available', signals.robots.found ? 'robots.txt found' : 'robots.txt missing');

  const googlebotAllowed = signals.robots.botAccess.Googlebot?.allowed !== false;
  const oaiAllowed = signals.robots.botAccess['OAI-SearchBot']?.allowed !== false;
  const chatGptAllowed = signals.robots.botAccess['ChatGPT-User']?.allowed !== false;

  points += addCheck(checks, googlebotAllowed, 18, 'Googlebot can access the site', signals.robots.botAccess.Googlebot?.evidence);
  points += addCheck(checks, oaiAllowed, 16, 'OAI-SearchBot can access the site', signals.robots.botAccess['OAI-SearchBot']?.evidence);
  points += addCheck(checks, chatGptAllowed, 8, 'ChatGPT-User can access the site', signals.robots.botAccess['ChatGPT-User']?.evidence);
  points += addCheck(checks, signals.llms.found && signals.llms.hasUsefulContent, 8, 'llms.txt provides AI-readable guidance', signals.llms.found ? `${signals.llms.length} characters` : 'llms.txt missing');
  points += addCheck(checks, signals.seo.noindexPages === 0, 16, 'Important crawled pages are indexable', `${signals.seo.noindexPages} noindex pages found`);

  if (!oaiAllowed) {
    findings.push(makeFinding({
      category: 'GEO/AEO',
      severity: 'high',
      title: 'ChatGPT Search crawler appears blocked',
      description: 'OAI-SearchBot access is important for ChatGPT Search visibility. Blocking it can prevent content from being surfaced in ChatGPT search answers.',
      recommendation: 'Update robots.txt to allow OAI-SearchBot on public content that should be eligible for ChatGPT Search.',
      evidence: signals.robots.botAccess['OAI-SearchBot']?.evidence,
      url: `${signals.crawl.origin}/robots.txt`,
      confidence: 'high',
      scoreImpact: 16,
    }));
  }

  if (!signals.llms.found) {
    findings.push(makeFinding({
      category: 'GEO/AEO',
      severity: 'medium',
      title: 'No llms.txt file found',
      description: 'An llms.txt file is not required, but it can give AI systems and agentic tools a concise map of important site content.',
      recommendation: 'Add /llms.txt with a short brand summary, priority pages, product/service descriptions, and preferred citation URLs.',
      evidence: 'GET /llms.txt did not return a usable file',
      url: `${signals.crawl.origin}/llms.txt`,
      confidence: 'medium',
      scoreImpact: 8,
    }));
  }

  return toCategory('Crawlability and AI Bot Access', points, checks);
}

function scoreStructuredData(signals, findings) {
  const checks = [];
  let points = 0;

  points += addCheck(checks, signals.schema.found, 18, 'JSON-LD schema exists', `${signals.schema.count} schema nodes found`);
  points += addCheck(checks, signals.schema.hasLocalBusiness, 12, 'Organization or LocalBusiness schema exists', schemaEvidence(signals));
  points += addCheck(checks, signals.schema.hasService || signals.schema.hasProduct, 18, 'Service or Product schema exists', schemaEvidence(signals));
  points += addCheck(checks, signals.schema.hasFAQ || signals.schema.hasArticle, 14, 'FAQ or Article schema supports answer extraction', schemaEvidence(signals));
  points += addCheck(checks, signals.schema.hasBreadcrumb, 8, 'Breadcrumb schema clarifies site hierarchy', schemaEvidence(signals));
  points += addCheck(checks, signals.schema.hasReview, 10, 'Review or rating schema exists', schemaEvidence(signals));
  points += addCheck(checks, signals.schema.invalidCount === 0, 20, 'No invalid JSON-LD detected', `${signals.schema.invalidCount} invalid JSON-LD blocks`);

  if (!signals.schema.found) {
    findings.push(makeFinding({
      category: 'Structured Data',
      severity: 'high',
      title: 'No structured data found',
      description: 'AI systems and search engines have fewer explicit facts about the business, products, services, reviews, and content hierarchy.',
      recommendation: 'Add JSON-LD for Organization, WebSite, BreadcrumbList, and the relevant Service, Product, FAQPage, Article, or LocalBusiness types.',
      evidence: 'No application/ld+json blocks were found in crawled pages',
      url: signals.startUrl,
      confidence: 'high',
      scoreImpact: 18,
    }));
  }

  return toCategory('Structured Data', points, checks);
}

function scoreAnswerReadiness(signals, findings) {
  const checks = [];
  let points = 0;

  points += addCheck(checks, signals.content.faqPages.length > 0 || signals.schema.hasFAQ, 18, 'FAQ or Q&A content exists', `${signals.content.faqPages.length} FAQ-like pages found`);
  points += addCheck(checks, signals.content.hasDirectAnswers, 18, 'Content includes direct answer statements', 'Direct answer language detected');
  points += addCheck(checks, signals.content.topicalDepth >= 8, 18, 'Site has topical depth', `${signals.content.topicalDepth} service/product/resource/comparison pages`);
  points += addCheck(checks, signals.content.servicePages.length + signals.content.productPages.length >= 3, 14, 'Core offerings have dedicated pages', `${signals.content.servicePages.length} service pages, ${signals.content.productPages.length} product pages`);
  points += addCheck(checks, signals.content.comparisonPages.length > 0, 10, 'Comparison or alternative content exists', `${signals.content.comparisonPages.length} comparison pages found`);
  points += addCheck(checks, signals.content.hasProcess, 10, 'Process/methodology is explained', 'Process language detected');
  points += addCheck(checks, signals.content.hasPricing, 6, 'Pricing, quote, or cost guidance exists', 'Pricing/cost language detected');
  points += addCheck(checks, signals.content.hasFreshnessSignals, 6, 'Freshness signals exist', 'Current/recent language detected');

  if (signals.content.topicalDepth < 4) {
    findings.push(makeFinding({
      category: 'Content',
      severity: 'high',
      title: 'Thin topical coverage for AI answer engines',
      description: 'The crawler found limited dedicated content for services, products, resources, or comparisons. AI answers tend to favor sources with clear topical depth.',
      recommendation: 'Create dedicated pages for each major service/product, use-case, comparison, and frequently asked buyer question.',
      evidence: `${signals.content.topicalDepth} topical pages detected across ${signals.pageCount} crawled pages`,
      url: signals.startUrl,
      confidence: 'high',
      scoreImpact: 18,
    }));
  }

  if (!signals.content.hasDirectAnswers) {
    findings.push(makeFinding({
      category: 'AEO',
      severity: 'medium',
      title: 'Few extractable direct answers',
      description: 'The site does not consistently use concise answer-style statements that AI systems can lift into responses.',
      recommendation: 'Add short answer blocks under H2/H3 questions, with plain-language definitions, cost ranges, timelines, requirements, and next steps.',
      evidence: 'Direct-answer phrase patterns were not detected in crawled text',
      url: signals.startUrl,
      confidence: 'medium',
      scoreImpact: 18,
    }));
  }

  return toCategory('Answer Readiness', points, checks);
}

function scoreEntityTrust(signals, findings) {
  const checks = [];
  let points = 0;

  points += addCheck(checks, Boolean(signals.entity.aboutPage), 14, 'About/company page exists', signals.entity.aboutPage?.url || 'Missing');
  points += addCheck(checks, Boolean(signals.entity.contactPage), 14, 'Contact page exists', signals.entity.contactPage?.url || 'Missing');
  points += addCheck(checks, signals.entity.sameAsLinks.length >= 2, 12, 'SameAs/social/profile links exist', `${signals.entity.sameAsLinks.length} external profile links`);
  points += addCheck(checks, signals.entity.hasCredentials, 16, 'Credentials and trust markers exist', 'Credentials/trust language detected');
  points += addCheck(checks, signals.entity.hasCaseStudies, 16, 'Case studies, testimonials, or proof exists', `${signals.entity.trustPages.length} trust pages found`);
  points += addCheck(checks, signals.entity.hasAuthorSignals, 12, 'Author, founder, or team attribution exists', 'Author/team language detected');
  points += addCheck(checks, signals.local.phones.length > 0 || signals.local.emails.length > 0, 16, 'Contact identity is machine-readable', `${signals.local.phones.length} phones, ${signals.local.emails.length} emails`);

  if (!signals.entity.aboutPage || !signals.entity.hasCredentials) {
    findings.push(makeFinding({
      category: 'Entity Trust',
      severity: 'medium',
      title: 'Weak entity and trust signals',
      description: 'The site needs clearer evidence of who is behind the brand, why they are credible, and where third-party systems can verify the entity.',
      recommendation: 'Strengthen the About page, add leadership/team attribution, certifications, partner badges, profile links, case studies, and review proof.',
      evidence: `About page: ${signals.entity.aboutPage ? 'found' : 'missing'}, credentials: ${signals.entity.hasCredentials ? 'found' : 'missing'}`,
      url: signals.startUrl,
      confidence: 'medium',
      scoreImpact: 16,
    }));
  }

  return toCategory('Entity Trust', points, checks);
}

function scoreTechnicalSeo(signals, findings) {
  const checks = [];
  let points = 0;

  points += addRatioCheck(checks, signals.seo.titleCoverage, 16, 'Title tag coverage', `${percent(signals.seo.titleCoverage)} of crawled pages have titles`);
  points += addRatioCheck(checks, signals.seo.descriptionCoverage, 14, 'Meta description coverage', `${percent(signals.seo.descriptionCoverage)} of crawled pages have descriptions`);
  points += addRatioCheck(checks, signals.seo.h1Coverage, 12, 'Single-H1 coverage', `${percent(signals.seo.h1Coverage)} of crawled pages have exactly one H1`);
  points += addCheck(checks, signals.seo.duplicateTitleCount === 0, 10, 'No duplicate titles detected', `${signals.seo.duplicateTitleCount} duplicate title values`);
  points += addCheck(checks, signals.seo.duplicateDescriptionCount === 0, 8, 'No duplicate descriptions detected', `${signals.seo.duplicateDescriptionCount} duplicate meta descriptions`);
  points += addCheck(checks, signals.sitemap.found, 10, 'Sitemap supports discovery', `${signals.sitemap.urlCount} sitemap URLs`);
  points += addCheck(checks, signals.seo.noindexPages === 0, 12, 'Crawled pages are indexable', `${signals.seo.noindexPages} noindex pages`);
  points += addCheck(checks, averageWordCount(signals.pages) >= 250, 10, 'Pages have enough crawlable text', `${averageWordCount(signals.pages)} average words per page`);
  points += addCheck(checks, signals.schema.hasBreadcrumb, 8, 'Breadcrumb hierarchy is explicit', schemaEvidence(signals));

  if (signals.seo.titleCoverage < 0.85 || signals.seo.descriptionCoverage < 0.75) {
    findings.push(makeFinding({
      category: 'SEO',
      severity: 'medium',
      title: 'Metadata coverage is incomplete',
      description: 'Missing titles or descriptions reduce search snippet quality and make pages less clear to AI/search systems.',
      recommendation: 'Add unique title tags and meta descriptions to important pages, especially service, product, location, and resource pages.',
      evidence: `${percent(signals.seo.titleCoverage)} title coverage, ${percent(signals.seo.descriptionCoverage)} description coverage`,
      url: signals.startUrl,
      confidence: 'high',
      scoreImpact: 14,
    }));
  }

  return toCategory('Technical SEO', points, checks);
}

function scorePageExperience(signals, pageSpeed, findings) {
  const checks = [];
  let points = 0;

  const mobile = pageSpeed.scores?.mobile;
  const desktop = pageSpeed.scores?.desktop;

  points += addNumericScore(checks, mobile, 35, 'Mobile PageSpeed performance', mobile == null ? 'Unavailable' : `${mobile}/100`);
  points += addNumericScore(checks, desktop, 25, 'Desktop PageSpeed performance', desktop == null ? 'Unavailable' : `${desktop}/100`);
  points += addRatioCheck(checks, signals.accessibility.averageAltRatio, 15, 'Image alt text coverage', `${percent(signals.accessibility.averageAltRatio)} average alt coverage`);
  points += addRatioCheck(checks, signals.accessibility.formLabelCoverage, 10, 'Form labels are likely present', `${percent(signals.accessibility.formLabelCoverage)} form label coverage`);
  points += addCheck(checks, signals.security.hasHttps, 15, 'HTTPS is enabled', signals.security.hasHttps ? 'HTTPS detected' : 'HTTP detected');

  if (mobile != null && mobile < 50) {
    findings.push(makeFinding({
      category: 'Performance',
      severity: 'medium',
      title: 'Mobile performance is weak',
      description: 'Slow mobile performance hurts conversion, crawl efficiency, and user engagement.',
      recommendation: 'Prioritize image optimization, JavaScript reduction, caching, and Core Web Vitals improvements for key templates.',
      evidence: `Mobile PageSpeed score: ${mobile}/100`,
      url: signals.startUrl,
      confidence: 'high',
      scoreImpact: 20,
    }));
  }

  if (mobile == null && desktop == null) {
    findings.push(makeFinding({
      category: 'Performance',
      severity: 'low',
      title: 'PageSpeed data unavailable',
      description: 'The audit could not retrieve PageSpeed data, so performance was not treated as a hard failure.',
      recommendation: 'Add a Google PageSpeed API key or rerun the audit if the API timed out or rate-limited the request.',
      evidence: 'PageSpeed API returned no Lighthouse result',
      url: signals.startUrl,
      confidence: 'high',
      scoreImpact: 0,
    }));
  }

  return toCategory('Page Experience', points, checks);
}

function scoreVerticalReadiness(signals, findings) {
  if (signals.commerce.likelyEcommerce) return scoreEcommerceReadiness(signals, findings);
  if (signals.saas.likelySaas) return scoreSaasReadiness(signals, findings);
  if (signals.local.city || signals.local.cityMentioned || signals.local.hasAddress || signals.local.hasServiceArea) {
    return scoreLocalReadiness(signals, findings);
  }
  return scoreGeneralReadiness(signals, findings);
}

function scoreEcommerceReadiness(signals, findings) {
  const checks = [];
  let points = 0;

  points += addCheck(checks, signals.commerce.productPageCount >= 3, 20, 'Product/category pages were found', `${signals.commerce.productPageCount} product-like pages`);
  points += addCheck(checks, signals.commerce.hasProductSchema, 22, 'Product schema exists', schemaEvidence(signals));
  points += addCheck(checks, signals.commerce.hasOfferSchema, 18, 'Offer/pricing schema exists', schemaEvidence(signals));
  points += addCheck(checks, signals.commerce.hasReviews, 20, 'Reviews/ratings are visible', 'Review or rating signals detected');
  points += addCheck(checks, signals.commerce.hasShippingReturns, 20, 'Shipping and returns content exists', 'Shipping/returns language detected');

  if (!signals.commerce.hasProductSchema) {
    findings.push(makeFinding({
      category: 'Ecommerce',
      severity: 'high',
      title: 'Product schema is missing or incomplete',
      description: 'Product schema helps search and AI systems understand item names, prices, availability, ratings, and offers.',
      recommendation: 'Add Product, Offer, AggregateRating, and BreadcrumbList schema to product and category templates.',
      evidence: schemaEvidence(signals),
      url: signals.startUrl,
      confidence: 'high',
      scoreImpact: 22,
    }));
  }

  return toCategory('Ecommerce Readiness', points, checks);
}

function scoreSaasReadiness(signals, findings) {
  const checks = [];
  let points = 0;

  points += addCheck(checks, signals.saas.hasPricingPage, 20, 'Pricing page exists', 'Pricing page detected');
  points += addCheck(checks, signals.saas.hasDocs, 18, 'Documentation/help content exists', 'Docs/help page detected');
  points += addCheck(checks, signals.saas.hasIntegrations, 18, 'Integration ecosystem is described', 'Integration language detected');
  points += addCheck(checks, signals.saas.hasSecurityTrust, 22, 'Security/trust content exists', 'Security/trust language detected');
  points += addCheck(checks, signals.saas.hasCaseStudies, 22, 'Case studies/customer proof exists', 'Case study pages detected');

  if (!signals.saas.hasPricingPage || !signals.saas.hasSecurityTrust) {
    findings.push(makeFinding({
      category: 'SaaS',
      severity: 'medium',
      title: 'SaaS evaluation content is incomplete',
      description: 'AI answers for SaaS comparisons often cite pricing, documentation, integrations, security, and customer proof.',
      recommendation: 'Add or strengthen pricing, docs, integrations, security, comparison, and case-study pages.',
      evidence: `Pricing: ${signals.saas.hasPricingPage}, docs: ${signals.saas.hasDocs}, security: ${signals.saas.hasSecurityTrust}`,
      url: signals.startUrl,
      confidence: 'medium',
      scoreImpact: 20,
    }));
  }

  return toCategory('SaaS Readiness', points, checks);
}

function scoreLocalReadiness(signals, findings) {
  const checks = [];
  let points = 0;

  points += addCheck(checks, signals.local.cityMentioned, 18, 'Target city is mentioned', signals.local.city || 'No city provided');
  points += addCheck(checks, signals.local.phones.length > 0, 18, 'Phone number is visible', `${signals.local.phones.length} phone values`);
  points += addCheck(checks, signals.local.hasAddress, 18, 'Address is visible', signals.local.hasAddress ? 'Address pattern detected' : 'No address pattern detected');
  points += addCheck(checks, signals.local.hasHours, 14, 'Business hours are visible', signals.local.hasHours ? 'Hours detected' : 'Hours missing');
  points += addCheck(checks, signals.local.hasServiceArea, 14, 'Service area language exists', signals.local.hasServiceArea ? 'Service area language detected' : 'Missing');
  points += addCheck(checks, signals.local.locationPageCount > 0 || signals.schema.hasLocalBusiness, 18, 'LocalBusiness/location structure exists', `${signals.local.locationPageCount} location pages`);

  if (!signals.local.hasAddress || !signals.local.hasHours) {
    findings.push(makeFinding({
      category: 'Local SEO',
      severity: 'medium',
      title: 'Local business signals are incomplete',
      description: 'Local and AI recommendation systems need clear NAP, hours, service areas, and location-specific content.',
      recommendation: 'Add full NAP, business hours, service areas, embedded map/profile links, and location/service-area pages where relevant.',
      evidence: `Address: ${signals.local.hasAddress}, hours: ${signals.local.hasHours}, service area: ${signals.local.hasServiceArea}`,
      url: signals.startUrl,
      confidence: 'medium',
      scoreImpact: 18,
    }));
  }

  return toCategory('Local Readiness', points, checks);
}

function scoreGeneralReadiness(signals, findings) {
  const checks = [];
  let points = 0;

  points += addCheck(checks, Boolean(signals.entity.aboutPage), 20, 'About page exists', signals.entity.aboutPage?.url || 'Missing');
  points += addCheck(checks, Boolean(signals.entity.contactPage), 20, 'Contact page exists', signals.entity.contactPage?.url || 'Missing');
  points += addCheck(checks, signals.content.topicalDepth >= 6, 25, 'Site has topical depth', `${signals.content.topicalDepth} topical pages`);
  points += addCheck(checks, signals.entity.trustPages.length > 0, 20, 'Trust/proof pages exist', `${signals.entity.trustPages.length} trust pages`);
  points += addCheck(checks, signals.content.hasPricing || signals.content.hasProcess, 15, 'Decision-support content exists', 'Pricing/process language detected');

  return toCategory('General Site Readiness', points, checks);
}

function scoreSecurity(signals, findings) {
  const checks = [];
  let points = 0;

  points += addCheck(checks, signals.security.hasHttps, 25, 'HTTPS enabled', signals.security.hasHttps ? 'HTTPS detected' : 'HTTPS missing');
  points += addCheck(checks, signals.security.hasHsts, 15, 'HSTS header present', signals.security.hasHsts ? 'Present' : 'Missing');
  points += addCheck(checks, signals.security.hasCsp, 20, 'Content Security Policy present', signals.security.hasCsp ? 'Present' : 'Missing');
  points += addCheck(checks, signals.security.hasFrameProtection, 15, 'Clickjacking protection present', signals.security.hasFrameProtection ? 'Present' : 'Missing');
  points += addCheck(checks, signals.security.hasNosniff, 15, 'MIME sniffing protection present', signals.security.hasNosniff ? 'Present' : 'Missing');
  points += addCheck(checks, signals.security.hasReferrerPolicy, 10, 'Referrer policy present', signals.security.hasReferrerPolicy ? 'Present' : 'Missing');

  return toCategory('Security', points, checks);
}

function scoreAccessibility(signals, pageSpeed, findings) {
  const checks = [];
  let points = 0;
  const lighthouse = pageSpeed.scores?.accessibility;

  points += addNumericScore(checks, lighthouse, 45, 'Lighthouse accessibility score', lighthouse == null ? 'Unavailable' : `${lighthouse}/100`);
  points += addRatioCheck(checks, signals.accessibility.averageAltRatio, 25, 'Image alt text coverage', `${percent(signals.accessibility.averageAltRatio)} average alt coverage`);
  points += addRatioCheck(checks, signals.accessibility.formLabelCoverage, 20, 'Form label coverage', `${percent(signals.accessibility.formLabelCoverage)} likely labeled forms`);
  points += addCheck(checks, signals.accessibility.pagesWithLandmarks > 0, 10, 'Semantic landmarks detected', `${signals.accessibility.pagesWithLandmarks} pages`);

  return toCategory('Accessibility', points, checks);
}

function addCheck(checks, passed, maxPoints, label, evidence) {
  checks.push({
    label,
    status: passed ? 'passed' : 'failed',
    score: passed ? maxPoints : 0,
    maxScore: maxPoints,
    evidence,
  });
  return passed ? maxPoints : 0;
}

function addRatioCheck(checks, ratio, maxPoints, label, evidence) {
  const safeRatio = Number.isFinite(ratio) ? Math.max(0, Math.min(1, ratio)) : 0;
  const score = Math.round(safeRatio * maxPoints);
  checks.push({
    label,
    status: safeRatio >= 0.85 ? 'passed' : safeRatio >= 0.55 ? 'partial' : 'failed',
    score,
    maxScore: maxPoints,
    evidence,
  });
  return score;
}

function addNumericScore(checks, numericScore, maxPoints, label, evidence) {
  if (numericScore == null) {
    checks.push({
      label,
      status: 'unknown',
      score: Math.round(maxPoints * 0.55),
      maxScore: maxPoints,
      evidence,
    });
    return Math.round(maxPoints * 0.55);
  }

  const score = Math.round((Math.max(0, Math.min(100, numericScore)) / 100) * maxPoints);
  checks.push({
    label,
    status: numericScore >= 80 ? 'passed' : numericScore >= 50 ? 'partial' : 'failed',
    score,
    maxScore: maxPoints,
    evidence,
  });
  return score;
}

function toCategory(name, points, checks) {
  const max = checks.reduce((sum, check) => sum + check.maxScore, 0) || 1;
  return {
    name,
    score: Math.round((points / max) * 100),
    points,
    maxPoints: max,
    checks,
  };
}

function makeFinding({ category, severity, title, description, recommendation, evidence, url, confidence, scoreImpact }) {
  return {
    id: slugify(`${category}-${title}`),
    category,
    severity,
    title,
    description,
    recommendation,
    evidence,
    url,
    confidence,
    scoreImpact,
  };
}

function compareSignal(label, primaryValue, competitorValue, gaps, advantages) {
  if (competitorValue > primaryValue) {
    gaps.push(`${label}: competitor has ${competitorValue}, audited site has ${primaryValue}`);
  } else if (primaryValue > competitorValue) {
    advantages.push(`${label}: audited site has ${primaryValue}, competitor has ${competitorValue}`);
  }
}

function schemaEvidence(signals) {
  return signals.schema.types.length ? signals.schema.types.join(', ') : 'No schema types found';
}

function averageWordCount(pages) {
  if (!pages.length) return 0;
  return Math.round(pages.reduce((sum, page) => sum + page.technical.wordCount, 0) / pages.length);
}

function percent(value) {
  return `${Math.round((value || 0) * 100)}%`;
}

function slugify(value) {
  return String(value).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '').slice(0, 80);
}

function severityWeight(severity) {
  return { high: 3, medium: 2, low: 1 }[severity] || 0;
}
