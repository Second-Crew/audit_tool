import { WEBSITE_TYPES, COMMERCE_MODES } from '../audit/site-type.js';
import { createHash } from 'node:crypto';
import { normalizeAuditUrl } from '../audit/url.js';
import { AgentError } from './auth.js';
export const PROFILES = ['auto','local_services','b2b_saas','ecommerce','publisher','mixed'];
export function validateAgentInput(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new AgentError('invalid_input',400);
  if (Object.keys(body).some(key => !['url','companyName','profile','maxPages','websiteType','ecommerceFunctionality'].includes(key))) throw new AgentError('unsupported_field',400);
  if (typeof body.url !== 'string' || body.url.length > 2048) throw new AgentError('invalid_url',400);
  let url;
  try { url = normalizeAuditUrl(body.url); } catch { throw new AgentError('invalid_url',400); }
  const parsed = new URL(url);
  if (parsed.username || parsed.password || (parsed.port && !['80','443'].includes(parsed.port))) throw new AgentError('invalid_url',400);
  if (body.companyName != null && (typeof body.companyName !== 'string' || body.companyName.length > 200)) throw new AgentError('invalid_company_name',400);
  if (!PROFILES.includes(body.profile || 'auto')) throw new AgentError('invalid_profile',400);
  if (body.maxPages != null && (!Number.isInteger(body.maxPages) || body.maxPages < 1 || body.maxPages > 100)) throw new AgentError('invalid_page_budget',400);
  if (!WEBSITE_TYPES.includes(body.websiteType || 'auto') || !COMMERCE_MODES.includes(body.ecommerceFunctionality || 'auto')) throw new AgentError('invalid_site_type',400);
  return { websiteType:body.websiteType || 'auto', ecommerceFunctionality:body.ecommerceFunctionality || 'auto', url, companyName: body.companyName || '', profile: body.profile || 'auto', maxPages: body.maxPages ?? 50 };
}
export function requestHash(input) { return createHash('sha256').update(JSON.stringify(input)).digest('hex'); }
export function idempotencyKey(request) {
  const key = request.headers.get('idempotency-key') || '';
  if (!/^[A-Za-z0-9_.:-]{8,128}$/.test(key)) throw new AgentError('invalid_idempotency_key',400);
  return key;
}
