export function buildActionPlan(report, primary, categoryDetails, findings) {
  const generalTasks = buildGeneralTasks(report, findings);
  const categoryTasks = buildCategoryTasks(categoryDetails);
  const pagePlans = buildPagePlans(primary?.pages || []);
  const pageTasks = pagePlans.flatMap((page) => page.tasks);
  const allTasks = [...generalTasks, ...categoryTasks, ...pageTasks];

  return {
    generalTasks,
    categoryTasks,
    pagePlans,
    totalTasks: allTasks.length,
    highImpactTasks: allTasks.filter((task) => task.impact === 'High').length,
  };
}

function buildGeneralTasks(report, findings) {
  const tasks = [];
  const roadmap = Array.isArray(report?.aiInsights?.roadmap) ? report.aiInsights.roadmap : [];

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

  roadmap.forEach((phase, phaseIndex) => {
    (phase.actions || []).forEach((action, actionIndex) => {
      tasks.push({
        id: `roadmap-${phaseIndex}-${actionIndex}`,
        title: phase.title || phase.phase || 'Roadmap action',
        detail: action,
        evidence: '',
        impact: phaseIndex === 0 ? 'High' : phaseIndex === 1 ? 'Medium' : 'Low',
        effort: phase.phase || `Phase ${phaseIndex + 1}`,
        source: 'Recommended Roadmap',
      });
    });
  });

  if (!tasks.length && report) {
    tasks.push({
      id: 'general-maintain',
      title: 'Maintain score momentum',
      detail: 'Review the category breakdown, keep high-performing pages current, and rerun this diagnostic after each content or technical release.',
      evidence: '',
      impact: 'Medium',
      effort: 'Ongoing',
      source: 'Diagnostic',
    });
  }

  return dedupeTasks(tasks).slice(0, 14);
}

function buildCategoryTasks(categoryDetails) {
  return Object.values(categoryDetails || {})
    .flatMap((category) => (category.checks || [])
      .filter((check) => check.status !== 'passed')
      .map((check, index) => ({
        id: `category-${slugify(category.name)}-${index}-${slugify(check.label)}`,
        title: check.label,
        detail: recommendActionForCheck(check.label, category.name),
        evidence: check.evidence,
        impact: categoryImpact(check, category),
        effort: check.maxScore >= 16 ? '1-2 days' : '2-4 hours',
        source: category.name,
      })))
    .sort((a, b) => impactWeight(b.impact) - impactWeight(a.impact))
    .slice(0, 28);
}

function buildPagePlans(pages) {
  if (!Array.isArray(pages)) return [];

  return pages
    .map((page, index) => {
      const tasks = buildPageTasks(page, index);
      const readiness = Math.max(0, Math.min(100, 100 - tasks.reduce((sum, task) => sum + impactPenalty(task.impact), 0)));
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
        readiness,
        priority,
      };
    })
    .filter((page) => page.tasks.length > 0)
    .sort((a, b) => impactWeight(b.priority) - impactWeight(a.priority) || a.readiness - b.readiness || b.tasks.length - a.tasks.length)
    .slice(0, 60);
}

function buildPageTasks(page, index) {
  const tasks = [];
  const utilityPage = isUtilityPage(page.url);
  const contentType = page.contentType || 'general';
  const titleLength = (page.title || '').trim().length;
  const descriptionLength = (page.metaDescription || '').trim().length;
  const wordCount = page.wordCount || 0;
  const h1Count = page.h1Count || 0;

  if (Number(page.status) >= 400) {
    addPageTask(tasks, index, 'status', 'Fix crawlable HTTP status', `Resolve the HTTP ${page.status} response so search and answer engines can reliably access this page.`, 'High', `HTTP ${page.status}`, 'Technical');
  }

  if (page.indexable === false && !utilityPage) {
    addPageTask(tasks, index, 'indexable', 'Make the page indexable', 'Remove accidental noindex directives or canonical conflicts if this page should be eligible for organic and answer-engine visibility.', 'High', page.robotsMeta || 'Page marked not indexable', 'Technical');
  }

  if (!titleLength) {
    addPageTask(tasks, index, 'title-missing', 'Add a unique title tag', 'Write a specific title that names the offering, audience, and brand in natural language.', 'Medium', 'Missing title tag', 'SEO');
  } else if ((titleLength < 28 || titleLength > 70) && !utilityPage) {
    addPageTask(tasks, index, 'title-length', 'Rewrite the title tag', 'Target 35-65 characters with the primary entity, service/product, and brand. Avoid keyword stuffing.', 'Medium', `${titleLength} characters`, 'SEO');
  }

  if (!descriptionLength && !utilityPage) {
    addPageTask(tasks, index, 'description-missing', 'Add a meta description', 'Summarize the page answer, proof point, and next step in one concise paragraph.', 'Medium', 'Missing meta description', 'SEO');
  } else if ((descriptionLength < 70 || descriptionLength > 170) && !utilityPage) {
    addPageTask(tasks, index, 'description-length', 'Tighten the meta description', 'Keep the description in the 90-155 character range and make it answer the page intent clearly.', 'Low', `${descriptionLength} characters`, 'SEO');
  }

  if (h1Count !== 1 && !utilityPage) {
    addPageTask(tasks, index, 'h1', 'Use one descriptive H1', 'Set one visible H1 that matches the page intent and makes the main topic obvious to crawlers and users.', 'Medium', `${h1Count} H1 tags found`, 'Content');
  }

  if (wordCount > 0 && wordCount < 300 && !utilityPage) {
    addPageTask(tasks, index, 'thin-content', 'Expand thin page content', 'Add direct answers, service/product details, eligibility, pricing or quote guidance, process, FAQs, and proof so AI systems have enough extractable context.', 'High', `${wordCount} words`, 'Content');
  }

  if (needsAnswerBlocks(contentType) && !page.hasVisibleFaq && !utilityPage) {
    addPageTask(tasks, index, 'faq', 'Add answer-ready FAQ blocks', 'Add 3-5 concise Q&A sections that answer buyer questions with facts, timelines, cost ranges, comparisons, and next steps.', 'Medium', 'No visible FAQ detected', 'AEO');
  }

  if ((page.schemaCount || 0) === 0 && !utilityPage) {
    addPageTask(tasks, index, 'schema', `Add ${schemaRecommendation(contentType)} schema`, 'Add validated JSON-LD that states the page entity, offering, breadcrumbs, and answer content where relevant.', 'High', 'No JSON-LD schema found on this page', 'Structured Data');
  }

  if ((page.imageCount || 0) > 0 && (page.imagesWithAlt || 0) < page.imageCount) {
    addPageTask(tasks, index, 'alt-text', 'Complete image alt text', 'Write useful alt text for meaningful images and leave decorative images empty only when they are truly decorative.', 'Low', `${page.imagesWithAlt || 0}/${page.imageCount} images have alt text`, 'Accessibility');
  }

  if (contentType === 'contact' && !page.hasPhone && !page.hasEmail) {
    addPageTask(tasks, index, 'contact', 'Add machine-readable contact identity', 'Add visible phone or email details, tel/mailto links, and matching Organization or LocalBusiness schema.', 'High', 'No phone or email detected', 'Entity Trust');
  }

  if (['service', 'product', 'location'].includes(contentType) && wordCount < 700 && !utilityPage) {
    addPageTask(tasks, index, 'commercial-proof', 'Add proof and decision support', 'Add testimonials, use cases, before/after examples, guarantees, reviews, credentials, and clear conversion next steps for this page intent.', 'Medium', `${wordCount} words on a ${contentType} page`, 'Entity Trust');
  }

  return tasks.slice(0, 9);
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

function categoryImpact(check, category) {
  if (check.maxScore >= 16 || category.score < 55 || check.status === 'failed') return 'High';
  if (check.maxScore >= 8 || check.status === 'partial') return 'Medium';
  return 'Low';
}

function recommendActionForCheck(label, categoryName) {
  const text = `${label} ${categoryName}`.toLowerCase();

  if (text.includes('sitemap')) return 'Generate and submit a clean XML sitemap that includes every indexable service, product, category, location, article, and conversion page.';
  if (text.includes('robots') || text.includes('googlebot') || text.includes('oai-searchbot') || text.includes('chatgpt')) return 'Update robots.txt so Googlebot, OAI-SearchBot, ChatGPT-User, PerplexityBot, and ClaudeBot can access public pages meant to rank or be cited.';
  if (text.includes('llms.txt')) return 'Create /llms.txt with a short brand summary, preferred citation URLs, core offerings, important facts, and support/contact paths.';
  if (text.includes('indexable')) return 'Review noindex tags, canonicals, robots rules, and redirects so important pages are indexable and self-canonical where appropriate.';
  if (text.includes('json-ld') || text.includes('schema') || text.includes('structured')) return 'Add validated JSON-LD for Organization, WebSite, BreadcrumbList, and the relevant Service, Product, FAQPage, Article, Review, or LocalBusiness types.';
  if (text.includes('faq') || text.includes('q&a')) return 'Add concise FAQ sections that answer real buyer questions and pair them with FAQPage schema when the content is visible on the page.';
  if (text.includes('direct answer')) return 'Add answer-first blocks under descriptive H2/H3 headings, with one clear answer followed by supporting details and proof.';
  if (text.includes('topical depth')) return 'Create dedicated pages for each major offer, use case, comparison, location, audience, and buyer question instead of relying on one broad page.';
  if (text.includes('dedicated pages')) return 'Map every core offering to its own page with entity-specific copy, FAQs, proof, schema, and internal links.';
  if (text.includes('comparison')) return 'Publish comparison, alternative, and versus pages that explain fit, tradeoffs, pricing, proof, and when to choose each option.';
  if (text.includes('process') || text.includes('methodology')) return 'Document the process step by step, including timelines, requirements, handoffs, and expected outcomes.';
  if (text.includes('pricing') || text.includes('cost')) return 'Add quote, pricing, or cost guidance with ranges, factors, inclusions, exclusions, and next steps.';
  if (text.includes('freshness')) return 'Add reviewed or updated dates to evergreen pages and refresh stale claims, screenshots, statistics, and examples.';
  if (text.includes('about') || text.includes('company')) return 'Strengthen the About page with history, leadership, credentials, service area or market focus, and external profile links.';
  if (text.includes('contact')) return 'Make contact identity visible and machine-readable with phone, email, address where relevant, forms, tel/mailto links, and matching schema.';
  if (text.includes('sameas') || text.includes('profile')) return 'Link to verified social, review, directory, marketplace, and knowledge-profile pages, then reference them with sameAs schema.';
  if (text.includes('credentials') || text.includes('trust')) return 'Add certifications, licenses, awards, partners, guarantees, review proof, and evidence that supports expertise and credibility.';
  if (text.includes('case') || text.includes('testimonial') || text.includes('proof')) return 'Create case studies or proof pages with problem, approach, measurable result, customer quote, and related offering links.';
  if (text.includes('author') || text.includes('team')) return 'Add author, reviewer, founder, expert, or team attribution to pages where experience and accountability matter.';
  if (text.includes('title') || text.includes('description') || text.includes('h1')) return 'Rewrite metadata and headings so each page has one clear topic, a unique title, and a concise answer-oriented description.';
  if (text.includes('page speed') || text.includes('performance') || text.includes('core web')) return 'Improve Core Web Vitals by compressing assets, removing unused scripts, lazy-loading media, and prioritizing critical content.';
  if (text.includes('security')) return 'Add baseline security headers and keep HTTPS redirects, HSTS, content type protections, and framing rules clean.';
  if (text.includes('accessibility') || text.includes('alt')) return 'Fix meaningful image alt text, landmarks, labels, contrast, and keyboard-friendly controls on core templates.';

  return `Create an implementation task for this ${categoryName} check, document the missing signal, update the relevant templates or pages, and validate the result after deployment.`;
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

function needsAnswerBlocks(contentType) {
  return ['general', 'service', 'product', 'location', 'education', 'about'].includes(contentType || 'general');
}

function schemaRecommendation(contentType) {
  const map = {
    service: 'Service',
    product: 'Product',
    location: 'LocalBusiness',
    education: 'Article',
    about: 'Organization',
    contact: 'Organization',
  };

  return map[contentType] || 'WebPage';
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

function impactPenalty(impact) {
  return { High: 18, Medium: 10, Low: 5 }[impact] || 6;
}
