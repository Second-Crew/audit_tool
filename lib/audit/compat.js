export function buildCompatibilityResponse(audit) {
  const primary = audit.primary;
  const llmOutput = audit.llmInsights?.status === 'generated' ? audit.llmInsights.output : null;
  const scores = {
    methodologyVersion: primary.scoring.methodology.version,
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
      chatbot: { detected: null, providers: [], confidence: 'not_checked' },
      voiceAgent: { detected: null, providers: [], confidence: 'not_checked' },
      calculator: { detected: null, types: [], confidence: 'not_checked' },
      aiBotAccess: primary.signals.robots.botAccess,
      llmsTxt: primary.signals.llms,
    },
    issues: primary.scoring.findings.filter((finding) => ['GEO/AEO', 'AEO'].includes(finding.category)).map((finding) => finding.title),
    opportunities: primary.scoring.findings.slice(0, 6).map((finding) => finding.recommendation),
  };

  const aeoGeoAnalysis = {
    score: scores.aeoGeo,
    checks: {
      crawlability: primary.scoring.categoryDetails.crawlability.score == null ? null : primary.scoring.categoryDetails.crawlability.score >= 70,
      schemaMarkup: primary.scoring.categoryDetails.structuredData.score == null ? null : primary.scoring.categoryDetails.structuredData.score >= 70,
      answerReadiness: primary.scoring.categoryDetails.answerReadiness.score == null ? null : primary.scoring.categoryDetails.answerReadiness.score >= 70,
      entityTrust: primary.scoring.categoryDetails.entityTrust.score == null ? null : primary.scoring.categoryDetails.entityTrust.score >= 70,
      verticalReadiness: primary.scoring.categoryDetails.verticalReadiness.score == null ? null : primary.scoring.categoryDetails.verticalReadiness.score >= 70,
    },
    issues: primary.scoring.findings.filter((finding) => ['GEO/AEO', 'AEO', 'Content', 'Entity Trust', 'Structured Data'].includes(finding.category)).map((finding) => finding.title),
    recommendations: primary.scoring.findings.map((finding) => finding.recommendation).slice(0, 10),
    llmContext: {
      wouldRecommend: null,
      visibilityStatus: 'not_measured',
      testQuery: audit.input.industry && audit.input.city
        ? `"Best ${audit.input.industry} in ${audit.input.city}"`
        : `"Best provider for this category"`,
      prediction: scores.aeoGeo == null ? 'AI answer inclusion and citations were not measured for a fixed query panel.' : scores.aeoGeo >= 80
        ? 'Strong on-site readiness for AI answer engines'
        : scores.aeoGeo >= 60
          ? 'Moderate readiness with clear improvement opportunities'
          : 'Weak readiness; answer engines may struggle to identify this site as a trusted source',
      reasoning: 'On-site checks describe sampled evidence. AI visibility requires observed answers and citations for relevant queries.',
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
      recommendation: ['passed','unknown'].includes(check.status) ? '' : 'Review and improve this technical SEO item.',
    })),
    passedChecks: primary.scoring.categoryDetails.technicalSeo.checks.filter((check) => check.status === 'passed').length,
    failedChecks: primary.scoring.categoryDetails.technicalSeo.checks.filter((check) => check.status === 'failed').length,
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
      { label: 'GEO/AEO', score: scores.aeoGeo, explanation: 'Not graded without query-level answer and citation observations.' },
      { label: 'Technical SEO', score: scores.seo, explanation: 'Sampled on-site technical checks; not a ranking or traffic score.' },
    ],
    roadmap: buildFallbackRoadmap(primary.scoring.findings),
    caveats: [
      'This diagnostic records sampled on-site evidence. It does not verify search rankings or live AI answer inclusion.',
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
    whyItMatters: `${category.name} records on-site evidence for manual review; passing does not guarantee search or AI inclusion.`,
    recommendation: category.score == null || category.score >= 80 ? '' : `Improve failed and partial checks in ${category.name}.`,
  }));
}

export function buildExecutiveSummary(audit) {
  const scores = audit.primary.scoring.scores;
  if (audit.primary.signals.contentEvidence?.status === 'incomplete') return `${audit.input.companyName || audit.primary.signals.domain} could not receive an overall grade. ${audit.primary.signals.contentEvidence.limitation || 'Sampled pages returned insufficient extractable content.'} Review those pages and repeat the audit before recommending content changes.`;
  if (audit.primary.scoring.methodology?.version === 'evidence-v1') return `${audit.input.companyName || audit.primary.signals.domain} had ${audit.primary.signals.pageCount} pages sampled. Technical SEO checks scored ${scores.seo == null ? 'not assessed' : `${scores.seo}/100`} on those pages. Overall and GEO/AEO grades were withheld because search rankings, AI answers, and citations were not observed. Review the page evidence and findings before acting.`;
  if (scores.overall == null) {
    const missing = Object.values(audit.primary.scoring.categoryDetails).filter(category => category.score == null);
    const names = missing.map(category => category.name).join(', ') || 'required categories';
    const unknown = missing.flatMap(category => category.checks.filter(check => check.status === 'unknown').map(check => check.label));
    return `${audit.input.companyName || audit.primary.signals.domain} had sufficient page content, but no overall grade was calculated because ${names} could not be fully measured${unknown.length ? ` (${unknown.join(', ')})` : ''}. Retry the unavailable measurements before prioritizing work.`;
  }
  return `${audit.input.companyName || audit.primary.signals.domain} scored ${scores.overall}/100 overall and ${scores.aeoGeo}/100 for GEO/AEO readiness. The audit crawled ${audit.primary.signals.pageCount} pages and found ${audit.primary.scoring.findings.length} prioritized findings with supporting evidence.`;
}

function buildIndustryInsight(audit) {
  const industry = audit.input.industry || 'this category';
  const target = audit.input.city ? `${industry} in ${audit.input.city}` : industry;
  if (audit.primary.signals.contentEvidence?.status === 'incomplete') return `For ${target}, ${audit.primary.signals.contentEvidence.usablePages} of ${audit.primary.signals.contentEvidence.pages} sampled pages had enough extractable text. ${audit.primary.signals.contentEvidence.limitation || 'Important page evidence remains incomplete.'} Review incomplete pages and repeat the audit before business recommendations.`;
  return `For ${target}, review crawl access, useful content, accurate business or product facts, and applicable structured data. The on-site sample does not establish search ranking or AI answer visibility; use measured query outcomes to assess those.`;
}

function mapStatus(status) {
  if (status === 'passed') return 'good';
  if (status === 'partial' || status === 'unknown') return 'partial';
  return 'missing';
}

function mapScoreToStatus(score) {
  if (score == null) return 'unknown';
  if (score >= 80) return 'good';
  if (score >= 55) return 'partial';
  return 'missing';
}

function gradeFromScore(score) {
  if (score == null) return 'Not assessed';
  if (score >= 90) return 'A';
  if (score >= 80) return 'B';
  if (score >= 70) return 'C';
  if (score >= 60) return 'D';
  return 'F';
}
