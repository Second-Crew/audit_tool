export function scoreSite(signals, pageSpeed = { scores: {}, metrics: {}, available: false }) {
  const findings = [];
  const categoryDetails = {};
  const incompleteContent = signals.contentEvidence?.status === 'incomplete';

  const crawl = scoreCrawlability(signals, findings);
  const schema = scoreStructuredData(signals, findings);
  const content = scoreAnswerReadiness(signals);
  const entity = scoreEntityTrust(signals, findings);
  const seo = scoreTechnicalSeo(signals, findings);
  const experience = scorePageExperience(signals, pageSpeed, findings);
  const vertical = scoreVerticalReadiness(signals, findings);
  const security = scoreSecurity(signals, findings);
  const accessibility = scoreAccessibility(signals, pageSpeed, findings);

  if (incompleteContent) {
    for (const category of [schema,content,entity,seo,vertical,accessibility]) {
      category.score=null;
      category.coverage=0;
      category.reason='Insufficient extracted page content; rendered evidence is required.';
      category.checks=category.checks.map(check=>({...check,status:'unknown',score:null}));
    }
    // Absence claims based on missing body content or client-injected metadata
    // are not reliable until the relevant pages have been rendered.
    findings.splice(0,findings.length,...findings.filter(f=>['Crawlability','Security','Page Experience'].includes(f.category)));
  }

  if (!incompleteContent) {
    for (const category of [schema, content, entity, vertical]) {
      category.score = null;
      category.reason = 'Observed checklist only; no validated relationship between this weighted total and search or AI visibility.';
      category.methodology = 'evidence-checklist-v1';
    }
  }

  categoryDetails.crawlability = crawl;
  categoryDetails.structuredData = schema;
  categoryDetails.answerReadiness = content;
  categoryDetails.entityTrust = entity;
  categoryDetails.technicalSeo = seo;
  categoryDetails.pageExperience = experience;
  categoryDetails.verticalReadiness = vertical;
  categoryDetails.security = security;
  categoryDetails.accessibility = accessibility;

  return {
    scores: {
      // A weighted on-site proxy cannot establish search ranking or AI answer
      // inclusion. Keep these outcome-like composites ungraded until query-level
      // observations and held-out calibration data exist.
      overall: null,
      aeoGeo: null,
      aiReadiness: null,
      seo: seo.score,
      crawlability: crawl.score,
      structuredData: null,
      answerReadiness: null,
      entityTrust: null,
      verticalReadiness: null,
      pageExperience: experience.score,
      security: security.score,
      accessibility: accessibility.score,
      mobile: pageSpeed.scores?.mobile,
      desktop: pageSpeed.scores?.desktop,
    },
    categoryDetails,
    methodology: {
      version: 'evidence-v1',
      seo: 'Sampled on-site technical SEO checks; not a search ranking or traffic score.',
      aeoGeo: 'Not assessed: requires a fixed query panel with observed answer inclusion and citations.',
      aiReadiness: 'Not assessed: no validated scale links sampled AI-facing site checks to observed answer inclusion or citations.',
      overall: 'Not assessed: cross-channel weights have not been validated against outcomes.',
    },
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

    // Legacy grades and unequal crawl samples are not comparative evidence.
    // Preserve competitor observations, but withhold superiority claims until
    // a matched page-type sampling methodology has been validated.
    const advantages = [];
    const gaps = [];
    const scoreDiff = null;

    return {
      name: competitor.input.name || competitor.signals.domain,
      url: competitor.signals.startUrl,
      domain: competitor.signals.domain,
      scores: competitor.scoring.scores,
      scoreDiff,
      comparisonStatus: 'inconclusive',
      comparisonReason: 'Matched page-type sampling and comparative scoring are not yet validated.',
      gaps,
      advantages,
      crawledPages: competitor.signals.pageCount,
    };
  });
}

function scoreCrawlability(signals, findings) {
  const checks = [];
  let points = 0;


  points += addCheck(checks, signals.sitemap.found, 14, 'XML sitemap is available', `${signals.sitemap.urlCount} sitemap URLs found`);
  points += addCheck(checks, signals.robots.found, 8, 'robots.txt is available', signals.robots.found ? 'robots.txt found' : 'robots.txt missing');

  const googlebotAllowed = signals.robots.botAccess.Googlebot?.allowed ?? null;
  const oaiAllowed = signals.robots.botAccess['OAI-SearchBot']?.allowed ?? null;

  points += addCheck(checks, googlebotAllowed, 18, 'Googlebot robots permission on sampled paths', signals.robots.botAccess.Googlebot?.evidence);
  points += addCheck(checks, oaiAllowed, 16, 'OAI-SearchBot robots permission on sampled paths', signals.robots.botAccess['OAI-SearchBot']?.evidence);
  // ChatGPT-User is user initiated and does not determine ChatGPT Search
  // inclusion; only OAI-SearchBot belongs in this readiness check.

  const importantNoindexCount = signals.seo.importantNoindexPages?.length ?? signals.seo.noindexPages;
  points += addCheck(checks, importantNoindexCount === 0, 16, 'Important crawled pages are indexable', `${importantNoindexCount} important noindex pages found`);

  if (oaiAllowed === false) {
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

  return toCategory('Crawlability and AI Bot Access', points, checks);
}

function scoreStructuredData(signals, findings) {
  const checks = [];
  let points = 0;
  const meaningful = signals.schema.nodes ? signals.schema.nodes.some(n => Object.keys(n.raw || {}).some(key => !key.startsWith('@'))) : signals.schema.found;

  addOptionalObservation(checks, meaningful, 'JSON-LD schema observed', `${signals.schema.count} schema nodes found`);
  addOptionalObservation(checks, meaningful && signals.schema.hasLocalBusiness, 'Organization or LocalBusiness schema observed', schemaEvidence(signals));
  if (signals.content.servicePages.length || signals.content.productPages.length) {
    addOptionalObservation(checks, meaningful && (signals.schema.hasService || signals.schema.hasProduct), 'Relevant Service or Product schema observed', schemaEvidence(signals));
  }
  if (signals.content.educationalPages?.length || signals.content.faqPages.length) {
    addOptionalObservation(checks, meaningful && (signals.schema.hasFAQ || signals.schema.hasArticle), 'Article or FAQ schema type observed', schemaEvidence(signals));
  }
  addOptionalObservation(checks, meaningful && signals.schema.hasBreadcrumb, 'Breadcrumb schema observed', schemaEvidence(signals));
  points += addCheck(checks, signals.schema.invalidCount === 0, 20, 'No invalid JSON-LD detected', `${signals.schema.invalidCount} invalid JSON-LD blocks`);

  if (!signals.schema.found) {
    findings.push(makeFinding({
      category: 'Structured Data',
      severity: 'low',
      title: 'No JSON-LD observed on sampled pages',
      description: 'No JSON-LD was observed on sampled pages. This does not establish a search ranking or AI visibility problem.',
      recommendation: 'If a supported rich-result feature fits these pages, add accurate markup that matches visible content and validate it with Google’s Rich Results Test.',
      evidence: 'No application/ld+json blocks were found in crawled pages',
      url: signals.startUrl,
      confidence: 'high',
      scoreImpact: 18,
    }));
  }

  return toCategory('Structured Data', points, checks);
}

function scoreAnswerReadiness(signals) {
  const checks = [];
  addOptionalObservation(checks, signals.content.faqPages.length > 0 || signals.schema.hasFAQ, 'FAQ or Q&A content observed', `${signals.content.faqPages.length} FAQ-like pages found`);
  addOptionalObservation(checks, signals.content.hasDirectAnswers, 'Question with nearby answer observed', 'Question-answer blocks checked');
  addOptionalObservation(checks, signals.content.comparisonPages.length > 0, 'Comparison content observed', `${signals.content.comparisonPages.length} comparison pages found`);
  addOptionalObservation(checks, signals.content.hasProcess, 'Process content observed', 'Process language checked');
  addOptionalObservation(checks, signals.content.hasPricing, 'Pricing or cost guidance observed', 'Pricing/cost language checked');
  addOptionalObservation(checks, signals.content.hasFreshnessSignals, 'Explicit recent update date observed', 'Publication/update dates checked');
  return toCategory('Answer Evidence', 0, checks);
}

function scoreEntityTrust(signals, findings) {
  const checks = [];
  let points = 0;
  const hasPublicDetails = signals.local.phones.length > 0 || signals.local.emails.length > 0;
  const contactEvidence = signals.entity.contactRoute?.url || (hasPublicDetails ? `${signals.local.phones.length} phones, ${signals.local.emails.length} emails` : null);

  points += addCheck(checks, Boolean(signals.entity.aboutPage), 14, 'About/company page exists', signals.entity.aboutPage?.url || 'Missing');
  points += addCheck(checks, Boolean(contactEvidence), 14, 'Public contact route or details observed', contactEvidence || 'No contact route observed on sampled pages');
  points += addCheck(checks, signals.entity.sameAsLinks.length >= 2, 12, 'SameAs/social/profile links exist', `${signals.entity.sameAsLinks.length} external profile links`);
  points += addCheck(checks, signals.entity.hasCredentials, 16, 'Credentials and trust markers exist', 'Credentials/trust language detected');
  points += addCheck(checks, signals.entity.hasCaseStudies, 16, 'Case studies, testimonials, or proof exists', `${signals.entity.trustPages.length} trust pages found`);
  points += addCheck(checks, signals.entity.hasAuthorSignals, 12, 'Author, founder, or team attribution exists', 'Author/team language detected');
  points += addCheck(checks, hasPublicDetails ? true : contactEvidence ? null : false, 16, 'Public phone or email details', hasPublicDetails ? `${signals.local.phones.length} phones, ${signals.local.emails.length} emails` : contactEvidence ? 'A linked form or booking path was observed; public phone/email is optional for this site.' : 'No public phone/email observed');

  return toCategory('Entity Trust', points, checks);
}

function scoreTechnicalSeo(signals, findings) {
  const checks = [];
  let points = 0;

  points += addRatioCheck(checks, signals.seo.titleCoverage, 16, 'Title tag coverage', `${percent(signals.seo.titleCoverage)} of crawled pages have titles`);
  points += addRatioCheck(checks, signals.seo.descriptionCoverage, 14, 'Meta description coverage', `${percent(signals.seo.descriptionCoverage)} of crawled pages have descriptions`);
  points += addRatioCheck(checks, signals.seo.h1Coverage, 12, 'H1 heading coverage', `${percent(signals.seo.h1Coverage)} of crawled pages have an H1`);
  points += addCheck(checks, signals.seo.duplicateTitleCount === 0, 10, 'No duplicate titles detected', `${signals.seo.duplicateTitleCount} duplicate title values`);
  points += addCheck(checks, signals.seo.duplicateDescriptionCount === 0, 8, 'No duplicate descriptions detected', `${signals.seo.duplicateDescriptionCount} duplicate meta descriptions`);
  const importantNoindexCount = signals.seo.importantNoindexPages?.length ?? signals.seo.noindexPages;
  points += addCheck(checks, importantNoindexCount === 0, 12, 'Important sampled pages are indexable', `${importantNoindexCount} important noindex pages`);

  if (signals.seo.titleCoverage < 0.85 || signals.seo.descriptionCoverage < 0.75) {
    findings.push(makeFinding({
      category: 'SEO',
      severity: 'medium',
      title: 'Metadata coverage is incomplete',
      description: 'Some sampled pages lack titles or descriptions that help describe those pages in search results. Their search impact has not been measured.',
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
  if (['marketing','corporate'].includes(signals.siteType?.value)) return scoreGeneralReadiness(signals, findings);
  if (signals.saas.likelySaas) return scoreSaasReadiness(signals, findings);
  if (signals.local.city || signals.local.cityMentioned || signals.local.hasAddress || signals.local.hasServiceArea) {
    return scoreLocalReadiness(signals, findings);
  }
  return scoreGeneralReadiness(signals, findings);
}

function scoreEcommerceReadiness(signals, findings) {
  const checks = [];
  let points = 0;
  const sampledProducts = signals.commerce.productPageCount > 0;
  const renderedProduct = signals.pages?.some((page) => page.contentType === 'product' && page.technical?.rendered) || false;
  const productSchemaObserved = signals.commerce.hasProductSchema ? true : renderedProduct ? false : null;
  const offerSchemaObserved = signals.commerce.hasOfferSchema ? true : renderedProduct ? false : null;

  points += addCheck(checks, sampledProducts ? true : null, 20, 'Product/category pages were sampled', `${signals.commerce.productPageCount} product pages sampled`);
  points += addCheck(checks, sampledProducts ? productSchemaObserved : null, 22, 'Product schema exists on sampled pages', productSchemaObserved == null ? 'Not observed; product rendering or Rich Results Test needed' : schemaEvidence(signals));
  points += addCheck(checks, sampledProducts ? offerSchemaObserved : null, 18, 'Offer/pricing schema exists on sampled pages', offerSchemaObserved == null ? 'Not observed; product rendering or Rich Results Test needed' : schemaEvidence(signals));
  points += addCheck(checks, sampledProducts && signals.commerce.hasReviews ? true : null, 20, 'Reviews/ratings are visible on sampled product pages', signals.commerce.hasReviews ? 'Visible rating evidence observed' : 'No visible rating confirmed; reviews are optional');
  points += addCheck(checks, signals.commerce.hasShippingReturns ? true : null, 20, 'Shipping and returns content observed', signals.commerce.hasShippingReturns ? 'Shipping and returns references observed' : 'Not observed in sampled pages');

  if (sampledProducts && productSchemaObserved === false) {
    findings.push(makeFinding({
      category: 'Ecommerce',
      severity: 'low',
      title: 'Product schema was not found on sampled pages',
      description: 'Product schema can make eligible product information available for richer Google Search results. This sample does not prove it is absent site-wide.',
      recommendation: 'Confirm the rendered product page with Google’s Rich Results Test; add accurate Product and Offer facts if needed. Include AggregateRating only when eligible reviews are visible and meet the applicable guidelines.',
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
  const contactEvidence = signals.entity.contactRoute?.url || (signals.local.phones.length || signals.local.emails.length ? `${signals.local.phones.length} phones, ${signals.local.emails.length} emails` : null);

  points += addCheck(checks, Boolean(signals.entity.aboutPage), 20, 'About page exists', signals.entity.aboutPage?.url || 'Missing');
  points += addCheck(checks, Boolean(contactEvidence), 20, 'Public contact route or details observed', contactEvidence || 'No contact route observed on sampled pages');
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
  if (passed == null) { checks.push({label,status:'unknown',score:null,maxScore:maxPoints,evidence}); return 0; }
  checks.push({
    label,
    status: passed ? 'passed' : 'failed',
    score: passed ? maxPoints : 0,
    maxScore: maxPoints,
    evidence,
  });
  return passed ? maxPoints : 0;
}

function addOptionalObservation(checks, observed, label, evidence) {
  checks.push({ label, status: observed ? 'observed' : 'not_observed', score: null, maxScore: 0, evidence });
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
      score: null,
      maxScore: maxPoints,
      evidence,
    });
    return 0;
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
  const expected = checks.reduce((sum, check) => sum + check.maxScore, 0) || 1;
  const max = checks.filter(c => c.status !== 'unknown').reduce((sum, check) => sum + check.maxScore, 0);
  const coverage = max / expected;
  const score = coverage >= 0.8 && max ? Math.round((points / max) * 100) : null;
  return {
    name,
    score,
    coverage,
    reason: score == null ? `Only ${Math.round(coverage * 100)}% of weighted checks were measured; at least 80% is required.` : null,
    methodology: 'legacy-heuristic-revised',
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
