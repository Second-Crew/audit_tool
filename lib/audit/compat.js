export function buildCompatibilityResponse(audit) {
  const primary = audit.primary;
  const llmOutput = audit.llmInsights?.status === 'generated' ? audit.llmInsights.output : null;
  const scores = {
    mobile: primary.scoring.scores.mobile,
    desktop: primary.scoring.scores.desktop,
    aiReadiness: primary.scoring.scores.aiReadiness,
    seo: primary.scoring.scores.seo,
    aeoGeo: primary.scoring.scores.aeoGeo,
    security: primary.scoring.scores.security,
    accessibility: primary.scoring.scores.accessibility,
    overall: primary.scoring.scores.overall,
  };

  const aiReadiness = {
    score: scores.aiReadiness,
    features: {
      chatbot: { detected: false, providers: [], confidence: 'not_checked' },
      voiceAgent: { detected: false, providers: [], confidence: 'not_checked' },
      calculator: { detected: false, types: [], confidence: 'not_checked' },
      aiBotAccess: primary.signals.robots.botAccess,
      llmsTxt: primary.signals.llms,
    },
    issues: primary.scoring.findings.filter((finding) => ['GEO/AEO', 'AEO'].includes(finding.category)).map((finding) => finding.title),
    opportunities: primary.scoring.findings.slice(0, 6).map((finding) => finding.recommendation),
  };

  const aeoGeoAnalysis = {
    score: scores.aeoGeo,
    checks: {
      crawlability: primary.scoring.categoryDetails.crawlability.score >= 70,
      schemaMarkup: primary.scoring.categoryDetails.structuredData.score >= 70,
      answerReadiness: primary.scoring.categoryDetails.answerReadiness.score >= 70,
      entityTrust: primary.scoring.categoryDetails.entityTrust.score >= 70,
      verticalReadiness: primary.scoring.categoryDetails.verticalReadiness.score >= 70,
    },
    issues: primary.scoring.findings.filter((finding) => ['GEO/AEO', 'AEO', 'Content', 'Entity Trust', 'Structured Data'].includes(finding.category)).map((finding) => finding.title),
    recommendations: primary.scoring.findings.map((finding) => finding.recommendation).slice(0, 10),
    llmContext: {
      wouldRecommend: scores.aeoGeo >= 70,
      testQuery: audit.input.industry && audit.input.city
        ? `"Best ${audit.input.industry} in ${audit.input.city}"`
        : `"Best provider for this category"`,
      prediction: scores.aeoGeo >= 80
        ? 'Strong on-site readiness for AI answer engines'
        : scores.aeoGeo >= 60
          ? 'Moderate readiness with clear improvement opportunities'
          : 'Weak readiness; answer engines may struggle to identify this site as a trusted source',
      reasoning: 'Prediction is based on crawlability, schema, answer content, entity trust, and vertical-specific evidence. It is not a live ranking guarantee.',
    },
    detailedChecks: toDetailedChecks(primary.scoring.categoryDetails),
  };

  const seoAnalysis = {
    score: scores.seo,
    issues: primary.scoring.findings.filter((finding) => finding.category === 'SEO').map((finding) => finding.title),
    metaTags: {
      titleCoverage: primary.signals.seo.titleCoverage,
      descriptionCoverage: primary.signals.seo.descriptionCoverage,
    },
    detailedChecks: primary.scoring.categoryDetails.technicalSeo.checks.map((check) => ({
      name: check.label,
      status: mapStatus(check.status),
      score: check.score,
      maxScore: check.maxScore,
      value: check.evidence,
      recommendation: check.status === 'passed' ? '' : 'Review and improve this technical SEO item.',
    })),
    passedChecks: primary.scoring.categoryDetails.technicalSeo.checks.filter((check) => check.status === 'passed').length,
    failedChecks: primary.scoring.categoryDetails.technicalSeo.checks.filter((check) => check.status !== 'passed').length,
  };

  const securityAnalysis = {
    score: scores.security,
    grade: gradeFromScore(scores.security),
    issues: primary.scoring.findings.filter((finding) => finding.category === 'Security').map((finding) => finding.title),
    checks: primary.signals.security,
    detailedChecks: primary.scoring.categoryDetails.security.checks.map((check) => ({
      name: check.label,
      status: mapStatus(check.status),
      score: check.score,
      maxScore: check.maxScore,
      details: [check.evidence],
      whyItMatters: 'Security headers and HTTPS reduce risk and support user trust.',
      recommendation: check.status === 'passed' ? '' : 'Add or correct this security control.',
    })),
    summary: scores.security >= 80 ? 'Strong baseline security headers.' : 'Security headers need improvement.',
  };

  const accessibilityAnalysis = {
    score: scores.accessibility,
    issues: primary.scoring.findings.filter((finding) => finding.category === 'Accessibility').map((finding) => finding.title),
    checks: {
      altText: primary.signals.accessibility.averageAltRatio >= 0.85,
      formLabels: primary.signals.accessibility.formLabelCoverage >= 0.85,
      ariaLandmarks: primary.signals.accessibility.pagesWithLandmarks > 0,
      headingHierarchy: primary.signals.seo.h1Coverage >= 0.85,
      skipLinks: null,
      langAttribute: null,
    },
    lighthouseScore: audit.pageSpeed.scores.accessibility,
  };

  const aiInsights = llmOutput ? {
    executiveSummary: llmOutput.executiveSummary,
    topIssues: llmOutput.topIssues,
    quickWins: llmOutput.quickWins,
    industryInsight: buildIndustryInsight(audit),
    llmRecommendation: llmOutput.llmRecommendation,
    scoreNarrative: llmOutput.scoreNarrative,
    roadmap: llmOutput.roadmap,
    caveats: llmOutput.caveats,
  } : {
    executiveSummary: buildExecutiveSummary(audit),
    topIssues: primary.scoring.findings.slice(0, 5).map((finding) => ({
      title: finding.title,
      impact: finding.severity === 'high' ? 'High' : finding.severity === 'medium' ? 'Medium' : 'Low',
      description: finding.description,
    })),
    quickWins: primary.scoring.findings.slice(0, 5).map((finding) => ({
      title: finding.title,
      description: finding.recommendation,
      timeEstimate: finding.severity === 'high' ? '1-3 hours' : '30-90 minutes',
    })),
    industryInsight: buildIndustryInsight(audit),
    llmRecommendation: aeoGeoAnalysis.llmContext.prediction,
    scoreNarrative: [
      { label: 'GEO/AEO', score: scores.aeoGeo, explanation: 'Based on crawlability, schema, answer content, entity trust, and vertical readiness.' },
      { label: 'SEO', score: scores.seo, explanation: 'Based on metadata, indexability, sitemap coverage, headings, and technical signals.' },
    ],
    roadmap: buildFallbackRoadmap(primary.scoring.findings),
    caveats: [
      'This diagnostic measures on-site readiness and manual competitor gaps. It does not verify live AI answer inclusion.',
    ],
  };

  return {
    success: true,
    scores,
    aiReadiness,
    aeoGeoAnalysis,
    seoAnalysis,
    securityAnalysis,
    accessibilityAnalysis,
    performanceMetrics: audit.pageSpeed.metrics,
    aiInsights,
    llm: {
      enabled: audit.llmInsights?.enabled || false,
      status: audit.llmInsights?.status || 'skipped',
      provider: audit.llmInsights?.provider || null,
      model: audit.llmInsights?.model || null,
      reason: audit.llmInsights?.reason || null,
    },
  };
}

function buildFallbackRoadmap(findings) {
  const topFindings = findings.slice(0, 4);
  return [
    {
      phase: 'Now',
      title: topFindings[0]?.title || 'Fix highest-impact readiness issues',
      actions: topFindings.slice(0, 2).map((finding) => finding.recommendation),
    },
    {
      phase: 'Next',
      title: 'Strengthen evidence quality',
      actions: topFindings.slice(2, 4).map((finding) => finding.recommendation),
    },
  ];
}

function toDetailedChecks(categoryDetails) {
  return [
    categoryDetails.crawlability,
    categoryDetails.structuredData,
    categoryDetails.answerReadiness,
    categoryDetails.entityTrust,
    categoryDetails.verticalReadiness,
  ].map((category) => ({
    name: category.name,
    status: mapScoreToStatus(category.score),
    score: category.score,
    maxScore: 100,
    details: category.checks.map((check) => `${check.label}: ${check.evidence}`),
    whyItMatters: `${category.name} affects whether AI and search systems can discover, understand, trust, and cite the site.`,
    recommendation: category.score >= 80 ? '' : `Improve failed and partial checks in ${category.name}.`,
  }));
}

function buildExecutiveSummary(audit) {
  const scores = audit.primary.scoring.scores;
  return `${audit.input.companyName || audit.primary.signals.domain} scored ${scores.overall}/100 overall and ${scores.aeoGeo}/100 for GEO/AEO readiness. The audit crawled ${audit.primary.signals.pageCount} pages and found ${audit.primary.scoring.findings.length} prioritized findings with supporting evidence.`;
}

function buildIndustryInsight(audit) {
  const industry = audit.input.industry || 'this category';
  const target = audit.input.city ? `${industry} in ${audit.input.city}` : industry;
  return `For ${target}, AI visibility depends on crawl access, clear entity facts, structured data, direct-answer content, and third-party trust signals. This report grades the on-site foundation first and leaves room to add paid SERP/backlink/review providers later.`;
}

function mapStatus(status) {
  if (status === 'passed') return 'good';
  if (status === 'partial' || status === 'unknown') return 'partial';
  return 'missing';
}

function mapScoreToStatus(score) {
  if (score >= 80) return 'good';
  if (score >= 55) return 'partial';
  return 'missing';
}

function gradeFromScore(score) {
  if (score >= 90) return 'A';
  if (score >= 80) return 'B';
  if (score >= 70) return 'C';
  if (score >= 60) return 'D';
  return 'F';
}
