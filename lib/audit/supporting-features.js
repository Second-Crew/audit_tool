import * as cheerio from 'cheerio';
import { cleanContent } from './evidence.js';

const normalize = value => String(value || '').replace(/\s+/g, ' ').trim();
const PROVIDERS = [
  ['Intercom', /(?:^|\.)(?:intercom\.io|intercomcdn\.com)$/],
  ['Crisp', /(?:^|\.)crisp\.chat$/],
  ['Tidio', /(?:^|\.)tidio\.co$/],
  ['Drift', /(?:^|\.)(?:drift\.com|driftt\.com)$/],
  ['Zendesk', /(?:^|\.)(?:zdassets\.com|zendesk\.com)$/],
  ['HubSpot', /(?:^|\.)usemessages\.com$/],
];

// Inspect existing HTML only. No widget interactions, forms or extra fetches.
export function extractFeatureEvidence($, url) {
  const integrations = [];
  $('script[src],iframe[src]').each((_, el) => {
    try {
      const target = new URL($(el).attr('src'), url);
      const provider = PROVIDERS.find(([, pattern]) => pattern.test(target.hostname))?.[0];
      if (provider) integrations.push({ provider, resource: `${target.origin}${target.pathname}` });
    } catch { /* Invalid resource URLs cannot identify a provider. */ }
  });
  const microdata = $('[itemscope][itemtype]').map((_, el) => $(el).attr('itemtype')).get();
  const rdfa = $('[typeof]').map((_, el) => $(el).attr('typeof')).get();
  const copy = cheerio.load($.html());
  cleanContent(copy);
  const root = copy('main,[role="main"]').first().length ? copy('main,[role="main"]').first() : copy('body');
  root.find('nav,header,footer,aside').remove();
  const answers = [];
  root.find('h2,h3,h4,dt,summary').each((_, el) => {
    const question = normalize(copy(el).text());
    if (!/\?$/.test(question)) return;
    const answer = normalize(copy(el).next().text());
    answers.push({ question: question.slice(0, 300), answer: answer.slice(0, 600),
      substantive: answer.length >= 40 && answer.split(/\s+/).length >= 7 });
  });
  const widgets = [];
  copy('button,[role="button"],iframe').each((_, el) => {
    const label = normalize(copy(el).attr('aria-label') || copy(el).attr('title') || copy(el).text());
    if (/\b(?:chat(?: with us)?|chatbot|assistant|open (?:the )?chat|message us|live chat)\b/i.test(label)) {
      widgets.push({ label: label.slice(0, 150), accessibleName: Boolean(label),
        keyboardControl: copy(el).is('button,iframe') || Number(copy(el).attr('tabindex')) >= 0 });
    }
  });
  return { answers, schemaFormats: { microdata: [...new Set(microdata)].slice(0, 12), rdfa: [...new Set(rdfa)].slice(0, 12) },
    chatbot: { integrations, widgets, contactFallback: /\b(?:contact|email|call us|talk to sales)\b/i.test(copy('body').text()) } };
}

export function assessLlms(crawl, pages, input) {
  const file = crawl.auxiliary.llms;
  const body = file.body || '';
  const links = [...body.matchAll(/\[([^\]]+)\]\(([^)\s]+)(?:\s+[^)]*)?\)/g)].slice(0, 20).map(match => {
    let url;
    try {
      const parsed = new URL(match[2], file.url || `${crawl.origin}/llms.txt`);
      if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password) throw Error();
      url = parsed.href;
    } catch { return { label: match[1].slice(0, 150), url: null, status: 'invalid', relevant: false }; }
    const key = value => { try { const u = new URL(value); return `${u.origin}${u.pathname.replace(/\/$/, '')}${u.search}`; } catch { return value; } };
    const page = pages.find(page => key(page.url) === key(url) || key(page.requestedUrl) === key(url));
    const error = (crawl.errors || []).find(error => key(error.url) === key(url));
    const relevant = new URL(url).hostname.replace(/^www\./, '') === crawl.domain.replace(/^www\./, '');
    return { label: match[1].slice(0, 150), url, relevant,
      status: page ? 'retrieved' : error?.status >= 400 ? 'failed' : 'not_sampled', httpStatus: page?.status || error?.status || null };
  });
  const title = body.match(/^#\s+(.+)$/m)?.[1] || '';
  const summary = body.match(/^>\s*(.+)$/m)?.[1] || body.split(/\n\s*\n/).find(block => !/^\s*#/.test(block) && normalize(block).length >= 80) || '';
  const company = normalize(input.companyName).toLowerCase();
  return { found: Boolean(file.found), url: file.url || `${crawl.origin}/llms.txt`, status: file.status ?? 0,
    length: body.length, truncated: Boolean(file.truncated), hasUsefulContent: Boolean(summary && links.some(link => link.relevant)),
    title: title.slice(0, 200), summary: normalize(summary).slice(0, 600), readableStructure: Boolean(title && /^##\s+\S/m.test(body)),
    companyMatch: company ? `${title} ${summary}`.toLowerCase().includes(company) : null,
    links, proposal: 'llmstxt.org, inspected 2026-10-06 (v2); basic guide checks accept legacy Markdown structure',
    observedAt: file.observedAt || null };
}

const record = page => ({ url: page.url, observedAt: page.observedAt || null, evidenceSource: page.evidenceSource || 'fetched_html' });
export function assessSupportingFeatures(signals) {
  const pages = signals.pages || [];
  const complete = pages.length > 0 && !signals.sampleFailures?.length && pages.every(p => !p.technical?.truncated && (p.text?.length || 0) >= 80);
  const absence = complete ? 'Not observed' : 'Could not verify';
  const feature = (id, name, presence, status, rationale, evidence, issues, recommendedFixes) => ({ id, name, presence, status, rationale, evidence, issues, recommendedFixes, optional: true });
  const faqEvidence = pages.flatMap(page => (page.featureEvidence?.answers || []).map(answer => ({ ...record(page),
    facts: `${answer.question} — ${answer.answer || 'No accessible answer observed'}`, substantive: answer.substantive,
    partialSnippetExclusions: page.indexing?.partialExclusions || 0, snippetAllowed: page.indexing?.snippetAllowed })));
  const faqIssues = faqEvidence.filter(e => !e.substantive).map(e => `Empty or short accessible answer: ${e.url}`);
  if (faqEvidence.some(e => e.snippetAllowed === false || e.partialSnippetExclusions > 0)) faqIssues.push('Answer-page snippet restrictions observed; inspect the excluded answer content.');
  const faq = feature('faq', 'FAQs / answer content', faqEvidence.some(e => e.substantive) ? 'Observed' : faqEvidence.length ? 'Observed incomplete questions' : complete ? 'Not observed' : 'Unknown',
    faqIssues.length ? 'Needs improvement' : faqEvidence.length ? 'Needs human review' : absence,
    'Real question/answer pairs are checked. A dedicated FAQ page is optional; marketing questions do not establish a FAQ page. Relevance, completeness and factual accuracy require human review.',
    faqEvidence, faqIssues, faqIssues.length ? ['Provide accessible substantive answers and review snippet exclusions where public answers should be reusable.', 'Review answers against actual customer questions and current business facts.'] : ['Review relevance and factual accuracy of observed answers; add useful answers where customer needs justify them.']);

  const schemaEvidence = [];
  const schemaIssues = [];
  let schemaDetected = false;
  for (const page of pages) {
    const schema = page.schema || { nodes: [], invalid: [] };
    const formats = page.featureEvidence?.schemaFormats || { microdata: [], rdfa: [] };
    if (schema.blockCount || schema.nodes?.length || schema.invalid?.length || formats.microdata.length || formats.rdfa.length) schemaDetected = true;
    if (schema.blockCount && !schema.nodes?.length && !schema.invalid?.length) {
      schemaIssues.push(`JSON-LD block contains no typed entity: ${page.url}`);
      schemaEvidence.push({ ...record(page), facts: 'JSON-LD script detected, but no typed entity was extracted; inspect empty or non-entity payload.' });
    }
    for (const invalid of schema.invalid || []) {
      schemaIssues.push(`Invalid JSON-LD syntax: ${page.url}`);
      schemaEvidence.push({ ...record(page), facts: 'JSON-LD block could not be parsed; raw payload withheld.' });
    }
    if (formats.microdata.length || formats.rdfa.length) schemaEvidence.push({ ...record(page), facts: `Microdata types: ${formats.microdata.join(', ') || 'not observed'}; RDFa types: ${formats.rdfa.join(', ') || 'not observed'}. Detected only; these formats are not validated in v1.` });
    for (const node of schema.nodes || []) {
      const types = Array.isArray(node.type) ? node.type : [node.type];
      const raw = node.raw || {};
      const entityType = types.some(type => /^(?:Organization|LocalBusiness|ProfessionalService|Product|Service|Article|BlogPosting)$/.test(type));
      if (entityType && !normalize(node.name)) schemaIssues.push(`Missing name/headline for ${types.join(', ')}: ${page.url}`);
      const canCheckVisibleName=(page.text?.length || 0)>=80 && !page.technical?.truncated;
      if (canCheckVisibleName && node.name && !(page.text || '').toLowerCase().includes(normalize(node.name).toLowerCase())) schemaIssues.push(`Entity name/headline not matched in extracted main text; verify visible consistency: ${page.url}`);
      let entityUrl = null;
      if (raw.url) {
        try { const parsed = new URL(raw.url); if (!['http:', 'https:'].includes(parsed.protocol)) throw Error(); entityUrl = `${parsed.origin}${parsed.pathname}`; }
        catch { schemaIssues.push(`Invalid entity URL: ${page.url}`); }
      }
      schemaEvidence.push({ ...record(page), facts: `Parseable JSON-LD: ${types.join(', ')}; name/headline: ${normalize(node.name).slice(0, 200) || 'not provided'}; entity URL: ${entityUrl || 'not provided'}.${canCheckVisibleName ? '' : ' Visible entity-name consistency could not be verified from incomplete text.'}` });
    }
  }
  const schema = feature('schema', 'Structured data / schema', schemaDetected ? 'Observed' : complete ? 'Not observed' : 'Unknown',
    schemaIssues.length ? 'Needs improvement' : schemaDetected ? 'Needs human review' : absence,
    'Validation target: JSON-LD parse validity and a documented entity subset (name/headline, absolute HTTP entity URL, extracted visible-name match). Microdata/RDFa detection only. This is not complete Schema.org or rich-result validation. Applicable type, required feature fields and factual accuracy need review.',
    schemaEvidence, [...new Set(schemaIssues)], ['Review applicable Organization, Service, Product, Article or FAQ types for the actual page; correct observed syntax/entity issues and verify markup matches visible facts with the appropriate validator. Optional markup does not affect the core score.']);

  const llms = signals.llms || {};
  const missing = llms.status === 404 || llms.status === 410;
  const llmsKnown = llms.found && llms.status >= 200 && llms.status < 300 && !llms.truncated;
  const llmsIssues = [];
  if (llmsKnown) {
    if (!llms.readableStructure) llmsIssues.push('No clear Markdown title/section structure observed.');
    if ((llms.summary?.length || 0) < 40 || (llms.summary || '').split(/\s+/).length < 7) llmsIssues.push('No substantive company summary observed (at least 40 characters and seven words).');
    if (!llms.links?.some(link => link.relevant)) llmsIssues.push('No relevant public site links observed.');
    if (llms.companyMatch === false) llmsIssues.push('Provided company name was not matched in the guide title/summary; verify identity consistency.');
    if (llms.links?.some(link => ['failed', 'invalid'].includes(link.status))) llmsIssues.push('Invalid or failed sampled guide links observed.');
  }
  const llmsFeature = feature('llms', 'llms.txt', llmsKnown ? 'Observed' : missing ? 'Not observed' : 'Unknown',
    llmsIssues.length ? 'Needs improvement' : llmsKnown ? 'Needs human review' : missing ? 'Not observed' : 'Could not verify',
    'A published guide can help agents that consume it. Presence does not prove ChatGPT, Claude or provider usage and does not override robots permissions. Business facts and unsampled links require review.',
    [{ url: llms.url || `${signals.crawl?.origin}/llms.txt`, observedAt: llms.observedAt || null, evidenceSource: 'fetched_file',
      facts: `HTTP ${llms.status ?? 'unknown'}; ${llms.length ?? 0} characters; ${llmsKnown ? `title: ${llms.title || 'not observed'}; summary: ${llms.summary || 'not observed'}` : 'File unavailable or incomplete'}. Proposal basis: ${llms.proposal || 'not recorded'}` },
      ...(llms.links || []).map(link => ({ url: link.url || llms.url, observedAt: llms.observedAt || null, evidenceSource: 'existing_crawl_sample', facts: `${link.label}: ${link.status}${link.httpStatus ? ` (HTTP ${link.httpStatus})` : ''}; ${link.relevant ? 'same-site reference' : 'external or invalid reference'}. No duplicate link fetches; unsampled links are unverified.` }))],
    llmsIssues, [llmsKnown ? 'Review the company summary, scope, linked business facts and unsampled links; correct observed structural or link issues.' : 'If useful for your audience, publish a concise public guide with a company summary and relevant links. It is optional.']);

  const chatEvidence = pages.filter(page => page.featureEvidence?.chatbot?.integrations.length || page.featureEvidence?.chatbot?.widgets.length).map(page => {
    const chat = page.featureEvidence.chatbot;
    return { ...record(page), facts: `Integration evidence: ${chat.integrations.map(i => `${i.provider} (${i.resource})`).join(', ') || 'provider unverified'}; visible control labels: ${chat.widgets.map(w => w.label).join(', ') || 'not observed'}; public contact fallback: ${chat.contactFallback ? 'observed' : 'not observed'}.`,
      visible: chat.widgets.length > 0, keyboardControl: chat.widgets.every(widget => widget.keyboardControl) };
  });
  const chatIssues = chatEvidence.filter(e => e.visible && !e.keyboardControl).map(e => `Chat control keyboard access could not be established: ${e.url}`);
  const chatbot = feature('chatbot', 'Chatbots / assistants', chatEvidence.length ? chatEvidence.some(e => e.visible) ? 'Visible control observed' : 'Integration observed; visibility unverified' : complete ? 'Not observed' : 'Unknown',
    chatIssues.length ? 'Needs improvement' : chatEvidence.length ? 'Needs human review' : absence,
    'A widget or integration does not establish AI capability or answer accuracy. Labels and static keyboard controls are observed; actual opening, focus behavior, grounding and escalation require human review. No messages or lead forms were sent.',
    chatEvidence, chatIssues, [chatEvidence.length ? 'Review keyboard/focus access, clear labeling, fallback contact, answer grounding, accuracy and escalation in an explicitly scoped interaction test.' : 'A chatbot is optional. Consider one only when it serves customer needs; validate access, grounding and escalation before relying on it.']);
  return [faq, schema, llmsFeature, chatbot];
}
