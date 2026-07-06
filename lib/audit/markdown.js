// Generates the Markdown version of a diagnostic report, structured as a
// handoff document an LLM (Claude, ChatGPT, ...) can execute: context first,
// then evidence, then a prioritized action plan.

export function buildMarkdownReport(data) {
  const {
    companyName,
    domain,
    startUrl,
    createdAt,
    pageCount,
    scores = {},
    findings = [],
    categoryDetails = {},
    competitorComparison = [],
    aiInsights = {},
    actionPlan = null,
  } = data;

  const lines = [];

  lines.push(`# GEO/AEO Diagnostic Report — ${companyName || domain}`);
  lines.push('');
  lines.push(`- **Website:** ${startUrl || domain}`);
  if (createdAt) lines.push(`- **Audit date:** ${new Date(createdAt).toISOString().slice(0, 10)}`);
  if (pageCount != null) lines.push(`- **Pages crawled:** ${pageCount}`);
  lines.push('- **Prepared by:** Second Crew');
  lines.push('');
  lines.push('> **How to use this document:** This is a technical GEO/AEO (Generative Engine Optimization / Answer Engine Optimization) audit. If you are an AI assistant, act as the implementation partner: work through the Action Plan top to bottom, starting with High impact tasks. Every finding includes the evidence it is based on. Ask for the site\'s CMS/stack before proposing code, propose concrete copy and schema markup where relevant, and do not invent facts about the business that are not in this report.');
  lines.push('');

  lines.push('## Scores (0-100)');
  lines.push('');
  lines.push('| Metric | Score |');
  lines.push('| --- | --- |');
  for (const [label, key] of [
    ['Overall', 'overall'],
    ['GEO/AEO readiness', 'aeoGeo'],
    ['AI readiness', 'aiReadiness'],
    ['Technical SEO', 'seo'],
    ['Mobile PageSpeed', 'mobile'],
    ['Desktop PageSpeed', 'desktop'],
    ['Security', 'security'],
    ['Accessibility', 'accessibility'],
  ]) {
    if (scores[key] != null) lines.push(`| ${label} | ${scores[key]} |`);
  }
  lines.push('');

  if (aiInsights.executiveSummary) {
    lines.push('## Executive Summary');
    lines.push('');
    lines.push(aiInsights.executiveSummary);
    lines.push('');
  }

  if (findings.length) {
    lines.push('## Prioritized Findings');
    lines.push('');
    findings.forEach((finding, index) => {
      lines.push(`### ${index + 1}. ${finding.title} (${finding.severity} severity, ${finding.category})`);
      lines.push('');
      if (finding.description) lines.push(finding.description);
      if (finding.evidence) lines.push(`- **Evidence:** ${finding.evidence}`);
      if (finding.url) lines.push(`- **URL:** ${finding.url}`);
      if (finding.recommendation) lines.push(`- **Recommendation:** ${finding.recommendation}`);
      if (finding.confidence) lines.push(`- **Confidence:** ${finding.confidence}`);
      lines.push('');
    });
  }

  const categories = Object.values(categoryDetails || {});
  if (categories.length) {
    lines.push('## Category Breakdown');
    lines.push('');
    for (const category of categories) {
      lines.push(`### ${category.name} — ${category.score}/100`);
      lines.push('');
      const attention = (category.checks || []).filter((check) => check.status !== 'passed');
      if (attention.length) {
        lines.push('| Check | Status | Evidence |');
        lines.push('| --- | --- | --- |');
        for (const check of attention) {
          lines.push(`| ${check.label} | ${check.status} (${check.score}/${check.maxScore}) | ${sanitizeCell(check.evidence)} |`);
        }
      } else {
        lines.push('All checks passed.');
      }
      lines.push('');
    }
  }

  if (competitorComparison.length) {
    lines.push('## Competitor Comparison');
    lines.push('');
    for (const competitor of competitorComparison) {
      if (competitor.error) {
        lines.push(`### ${competitor.name || competitor.domain} — crawl failed`);
        lines.push('');
        lines.push(`Could not be compared: ${competitor.error}`);
        lines.push('');
        continue;
      }
      lines.push(`### ${competitor.name || competitor.domain} (${competitor.domain})`);
      lines.push('');
      lines.push(`- **GEO/AEO:** ${competitor.scores?.aeoGeo ?? 'N/A'} (diff vs audited site: ${competitor.scoreDiff > 0 ? '+' : ''}${competitor.scoreDiff})`);
      if (competitor.gaps?.length) {
        lines.push('- **Where the competitor is ahead:**');
        competitor.gaps.forEach((gap) => lines.push(`  - ${gap}`));
      }
      if (competitor.advantages?.length) {
        lines.push('- **Where the audited site is ahead:**');
        competitor.advantages.forEach((advantage) => lines.push(`  - ${advantage}`));
      }
      lines.push('');
    }
  }

  if (actionPlan) {
    lines.push('## Action Plan');
    lines.push('');
    lines.push(`${actionPlan.totalTasks} tasks total, ${actionPlan.highImpactTasks} high impact. Execute in order: sitewide tasks, category fixes, then page-by-page work.`);
    lines.push('');

    if (actionPlan.generalTasks?.length) {
      lines.push('### Sitewide Score-Lift Tasks');
      lines.push('');
      actionPlan.generalTasks.forEach((task) => lines.push(...taskLines(task)));
    }

    if (actionPlan.categoryTasks?.length) {
      lines.push('### Category Fixes');
      lines.push('');
      actionPlan.categoryTasks.forEach((task) => lines.push(...taskLines(task)));
    }

    if (actionPlan.pagePlans?.length) {
      lines.push('### Page-by-Page Execution');
      lines.push('');
      for (const page of actionPlan.pagePlans) {
        lines.push(`#### ${page.title} (${page.contentType}, readiness ${page.readiness}/100)`);
        lines.push('');
        lines.push(`URL: ${page.url}`);
        lines.push('');
        page.tasks.forEach((task) => lines.push(...taskLines(task)));
      }
    }
  }

  if (aiInsights.roadmap?.length && !actionPlan?.generalTasks?.length) {
    lines.push('## Recommended Roadmap');
    lines.push('');
    for (const phase of aiInsights.roadmap) {
      lines.push(`### ${phase.phase}: ${phase.title}`);
      (phase.actions || []).forEach((action) => lines.push(`- ${action}`));
      lines.push('');
    }
  }

  const caveats = aiInsights.caveats?.length
    ? aiInsights.caveats
    : ['This diagnostic measures on-site readiness and manual competitor gaps. It does not verify live AI answer inclusion.'];
  lines.push('## Caveats');
  lines.push('');
  caveats.forEach((caveat) => lines.push(`- ${caveat}`));
  lines.push('');

  return lines.join('\n');
}

function taskLines(task) {
  const lines = [`- [ ] **${task.title}** (${task.impact} impact${task.effort ? `, ${task.effort}` : ''}${task.source ? `, ${task.source}` : ''})`];
  if (task.detail) lines.push(`  - ${task.detail}`);
  if (task.evidence) lines.push(`  - Evidence: ${task.evidence}`);
  return lines;
}

function sanitizeCell(value) {
  return String(value || '').replace(/\|/g, '\\|').replace(/\s+/g, ' ').trim();
}
