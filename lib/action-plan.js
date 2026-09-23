export function buildActionPlan(report, primary, categoryDetails, findings) {
  if (primary?.contentEvidence?.status === 'incomplete') {
    const { usablePages = 0, pages = 0 } = primary.contentEvidence;
    const rendering = primary?.crawl?.summary?.rendering;
    const generalTasks = [{
      id: 'evidence-recovery',
      title: 'Complete page evidence before making recommendations',
      detail: 'Review pages with insufficient extracted text, repeat browser rendering where needed, and rerun the audit before prioritizing content or page changes.',
      evidence: `${usablePages} of ${pages} sampled pages had enough content; ${primary.contentEvidence.limitation || 'Coverage is below the required threshold.'}${rendering ? ` ${rendering.succeeded} rendered successfully, ${rendering.failed} failed, ${rendering.skipped} skipped` : ''}`,
      impact: 'High',
      effort: 'Before outreach',
      source: 'Audit coverage',
    }];
    return { status: 'evidence_incomplete', generalTasks, categoryTasks: [], pagePlans: [], totalTasks: 1, highImpactTasks: 1 };
  }
  if (report?.scores?.overall === null) {
    const missing = Object.values(categoryDetails || {}).filter(category => category.score == null);
    const checks = missing.flatMap(category => (category.checks || []).filter(check => check.status === 'unknown').map(check => `${category.name}: ${check.label}`));
    const generalTasks = [{
      id: 'measurement-recovery',
      title: 'Complete unavailable measurements before prioritizing work',
      detail: 'Retry or independently verify the unavailable checks, then rerun the audit before using composite scores or a ranked implementation plan.',
      evidence: checks.length ? checks.join('; ') : missing.map(category => category.name).join('; ') || 'One or more required category scores are unavailable',
      impact: 'High',
      effort: 'Before outreach',
      source: 'Measurement coverage',
    }];
    return { status: 'measurement_incomplete', generalTasks, categoryTasks: [], pagePlans: [], totalTasks: 1, highImpactTasks: 1 };
  }
  const generalTasks = buildGeneralTasks(findings);
  const categoryTasks = buildCategoryTasks(categoryDetails, findings);
  const allPagePlans = buildPagePlans(primary?.pages || []);
  const pagePlans = allPagePlans.slice(0, 8);
  const pageTasks = pagePlans.flatMap((page) => page.tasks);
  const allTasks = [...generalTasks, ...categoryTasks, ...pageTasks];

  return {
    status: 'ready_for_review',
    generalTasks,
    categoryTasks,
    pagePlans,
    additionalPagesWithWork: allPagePlans.length - pagePlans.length,
    totalTasks: allTasks.length,
    highImpactTasks: allTasks.filter((task) => task.impact === 'High').length,
  };
}

function buildGeneralTasks(findings) {
  const tasks = [];

  findings.slice(0, 8).forEach((finding, index) => {
    tasks.push({
      id: `finding-${finding.id || index}`,
      title: finding.title || 'Resolve prioritized finding',
      detail: finding.recommendation || finding.description || 'Address the finding documented in the diagnostic.',
      evidence: finding.evidence,
      impact: finding.severity === 'high' ? 'High' : finding.severity === 'low' ? 'Low' : 'Medium',
      effort: finding.severity === 'high' ? 'This week' : 'Next sprint',
      source: finding.category,
    });
  });

  return dedupeTasks(tasks).slice(0, 14);
}

function buildCategoryTasks(categoryDetails, findings = []) {
  const grouped = new Map();
  const hasSchemaFinding = findings.some(finding => finding.title === 'No structured data found');
  for (const category of Object.values(categoryDetails || {})) {
    for (const check of category.checks || []) {
      if (!['failed', 'partial'].includes(check.status)) continue;
      if (hasSchemaFinding && (/structured data/i.test(category.name) || /breadcrumb hierarchy/i.test(check.label))) continue;
      const detail = recommendActionForCheck(check.label, category.name);
      const key = detail.toLowerCase();
      const existing = grouped.get(key);
      const item = existing || {
        id: `category-${slugify(check.label)}`,
        title: categoryTaskTitle(check.label),
        detail,
        evidence: '',
        impact: categoryTaskImpact(check.label),
        effort: 'Review before implementation',
        source: category.name,
        observations: [],
      };
      item.observations.push(`${check.label}: ${check.evidence || check.status}`);
      if (impactWeight(categoryTaskImpact(check.label)) > impactWeight(item.impact)) item.impact = categoryTaskImpact(check.label);
      grouped.set(key, item);
    }
  }
  return Array.from(grouped.values())
    .map(({observations,...task}) => ({...task,evidence:observations.join('; ')}))
    .sort((a,b) => impactWeight(b.impact)-impactWeight(a.impact))
    .slice(0, 8);
}

function categoryTaskTitle(label) {
  if (/page ?speed|performance/i.test(label)) return 'Investigate measured page performance';
  if (/form label/i.test(label)) return 'Review form control labels';
  if (/HSTS|Content Security Policy|Clickjacking|MIME sniffing|Referrer policy/i.test(label)) return 'Review response security headers';
  if (/contact page|contact identity/i.test(label)) return 'Verify contact paths and public identity';
  if (/single-H1/i.test(label)) return 'Review heading structure on core templates';
  if (/json-ld|schema|structured/i.test(label)) return 'Review applicable structured data';
  return `Review ${label.toLowerCase()}`;
}

function categoryTaskImpact(label) {
  if (/single-H1|contact page|contact identity|breadcrumb/i.test(label)) return 'Low';
  if (/oai-searchbot|googlebot|noindex/i.test(label)) return 'High';
  return 'Medium';
}

function buildPagePlans(pages) {
  if (!Array.isArray(pages)) return [];

  return pages
    .map((page, index) => {
      const tasks = buildPageTasks(page, index);
      const priority = tasks.some((task) => task.impact === 'High')
        ? 'High'
        : tasks.some((task) => task.impact === 'Medium')
          ? 'Medium'
          : 'Low';

      return {
        url: page.url,
        title: page.title || titleFromUrl(page.url),
        contentType: page.contentType || 'general',
        indexable: page.indexable !== false,
        h1Count: page.h1Count || 0,
        wordCount: page.wordCount || 0,
        hasVisibleFaq: Boolean(page.hasVisibleFaq),
        schemaCount: page.schemaCount || 0,
        tasks,
        priority,
      };
    })
    .filter((page) => page.tasks.length > 0)
    .sort((a, b) => impactWeight(b.priority) - impactWeight(a.priority) || b.tasks.length - a.tasks.length);
}

function buildPageTasks(page, index) {
  const tasks = [];
  if (page.contentEvidenceIncomplete) return tasks;
  const utilityPage = isUtilityPage(page.url);
  const titleLength = (page.title || '').trim().length;
  const descriptionLength = (page.metaDescription || '').trim().length;

  if (Number(page.status) >= 400) {
    addPageTask(tasks, index, 'status', 'Fix crawlable HTTP status', `Resolve the HTTP ${page.status} response so search and answer engines can reliably access this page.`, 'High', `HTTP ${page.status}`, 'Technical');
  }

  if (page.indexable === false && !utilityPage) {
    addPageTask(tasks, index, 'indexable', 'Review page indexing', 'Confirm whether this page should be indexable. If its noindex directive is accidental, correct it and rerun the audit.', 'Medium', page.robotsMeta || 'Page marked not indexable', 'Technical');
  }

  if (!titleLength) {
    addPageTask(tasks, index, 'title-missing', 'Add a unique title tag', 'Write a specific title that names the offering, audience, and brand in natural language.', 'Medium', 'Missing title tag', 'SEO');
  }

  if (!descriptionLength && !utilityPage) {
    addPageTask(tasks, index, 'description-missing', 'Review missing meta description', 'Write a useful page summary if this page needs a controlled search snippet; search engines may choose a different snippet.', 'Low', 'Missing meta description', 'SEO');
  }

  if ((page.imageCount || 0) > 0 && (page.imagesWithAlt || 0) < page.imageCount) {
    addPageTask(tasks, index, 'alt-text', 'Review image alternatives', 'Check whether images convey information. Add useful alternatives for meaningful images; decorative images can use empty alt text.', 'Low', `${page.imagesWithAlt || 0}/${page.imageCount} images have alt attributes`, 'Accessibility');
  }

  return tasks;
}

function addPageTask(tasks, pageIndex, key, title, detail, impact, evidence, source) {
  tasks.push({
    id: `page-${pageIndex}-${key}`,
    title,
    detail,
    impact,
    evidence,
    effort: impact === 'High' ? 'Priority fix' : impact === 'Medium' ? 'Standard fix' : 'Polish',
    source,
  });
}

function recommendActionForCheck(label, categoryName) {
  const text = `${label} ${categoryName}`.toLowerCase();

  if (text.includes('sitemap')) return 'Generate and submit a clean XML sitemap that includes every indexable service, product, category, location, article, and conversion page.';
  if (text.includes('robots') || text.includes('googlebot') || text.includes('oai-searchbot') || text.includes('chatgpt')) return 'Update robots.txt so Googlebot, OAI-SearchBot, ChatGPT-User, PerplexityBot, and ClaudeBot can access public pages meant to rank or be cited.';
  if (text.includes('llms.txt')) return 'Create /llms.txt with a short brand summary, preferred citation URLs, core offerings, important facts, and support/contact paths.';
  if (text.includes('indexable')) return 'Review noindex tags, canonicals, robots rules, and redirects so important pages are indexable and self-canonical where appropriate.';
  if (text.includes('json-ld') || text.includes('schema') || text.includes('structured')) return 'Add accurate Organization or WebSite JSON-LD first, then mark up Service, Article, Product, or Breadcrumb content only on matching pages. Validate Google-supported features before claiming search benefits.';
  if (text.includes('faq') || text.includes('q&a')) return 'Add concise FAQ sections that answer real buyer questions. FAQPage markup should be considered only where the page and site meet current search feature eligibility.';
  if (text.includes('direct answer')) return 'Add answer-first blocks under descriptive H2/H3 headings, with one clear answer followed by supporting details and proof.';
  if (text.includes('topical depth')) return 'Create dedicated pages for each major offer, use case, comparison, location, audience, and buyer question instead of relying on one broad page.';
  if (text.includes('dedicated pages')) return 'Map every core offering to its own page with entity-specific copy, FAQs, proof, schema, and internal links.';
  if (text.includes('comparison')) return 'Publish comparison, alternative, and versus pages that explain fit, tradeoffs, pricing, proof, and when to choose each option.';
  if (text.includes('process') || text.includes('methodology')) return 'Document the process step by step, including timelines, requirements, handoffs, and expected outcomes.';
  if (text.includes('pricing') || text.includes('cost')) return 'Add quote, pricing, or cost guidance with ranges, factors, inclusions, exclusions, and next steps.';
  if (text.includes('freshness')) return 'Add reviewed or updated dates to evergreen pages and refresh stale claims, screenshots, statistics, and examples.';
  if (text.includes('about') || text.includes('company')) return 'Verify the About page and review whether leadership, credentials, service area, and external profile links are presented clearly.';
  if (text.includes('contact')) return 'Verify whether a public contact path exists beyond the sampled URLs. If contact details are intended to be public, make them easy to find and match any structured data to visible facts.';
  if (text.includes('sameas') || text.includes('profile')) return 'Link to verified social, review, directory, marketplace, and knowledge-profile pages, then reference them with sameAs schema.';
  if (text.includes('credentials') || text.includes('trust')) return 'Add certifications, licenses, awards, partners, guarantees, review proof, and evidence that supports expertise and credibility.';
  if (text.includes('case') || text.includes('testimonial') || text.includes('proof')) return 'Create case studies or proof pages with problem, approach, measurable result, customer quote, and related offering links.';
  if (text.includes('author') || text.includes('team')) return 'Add author, reviewer, founder, expert, or team attribution to pages where experience and accountability matter.';
  if (text.includes('single-h1')) return 'Inspect representative page templates for a clear main heading and logical hierarchy. A second H1 alone is not evidence of a search defect.';
  if (text.includes('form label')) return 'Inspect representative forms and verify each control has an accessible name; repair unlabeled controls on the shared template.';
  if (text.includes('title') || text.includes('description') || text.includes('h1')) return 'Review page metadata and headings for clarity and distinct purpose; fix confirmed omissions or duplication.';
  if (text.includes('page speed') || text.includes('performance') || text.includes('core web')) return 'Review PageSpeed diagnostics and available field data to identify the actual bottleneck before choosing performance changes.';
  if (text.includes('security') || /hsts|content security policy|clickjacking|mime sniffing|referrer policy/i.test(text)) return 'Confirm the sampled response headers, then configure applicable protections in the shared web server or hosting template.';
  if (text.includes('accessibility') || text.includes('alt')) return 'Fix meaningful image alt text, landmarks, labels, contrast, and keyboard-friendly controls on core templates.';

  return `Verify the “${label}” observation in ${categoryName} on representative pages, then fix it only if the check applies and the evidence confirms a gap.`;
}

function dedupeTasks(tasks) {
  const seen = new Set();
  return tasks.filter((task) => {
    const key = `${task.title}|${task.detail}`.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function isUtilityPage(url = '') {
  return /privacy|terms|login|sign-in|cart|checkout|account|wp-json|feed|tag\/|category\/|author\//i.test(url);
}

function titleFromUrl(url = '') {
  try {
    const parsed = new URL(url);
    const lastPath = parsed.pathname.replace(/\/$/, '').split('/').filter(Boolean).at(-1);
    return lastPath ? lastPath.replace(/[-_]+/g, ' ') : parsed.hostname;
  } catch {
    return url || 'Untitled page';
  }
}

function slugify(value = '') {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || 'item';
}

function impactWeight(impact) {
  return { High: 3, Medium: 2, Low: 1 }[impact] || 0;
}
