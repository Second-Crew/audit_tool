import { createHash, timingSafeEqual } from 'node:crypto';
export class AgentError extends Error {
  constructor(code, status) { super(code); this.code = code; this.status = status; }
}
export function authenticateAgent(request, scope, env = process.env) {
  if (env.AGENT_API_ENABLED !== 'true') throw new AgentError('api_disabled', 503);
  const header = request.headers.get('authorization') || '';
  if (!/^Bearer [A-Za-z0-9_-]{32,256}$/.test(header)) throw new AgentError('unauthorized', 401);
  let keys;
  try { keys = JSON.parse(env.AGENT_API_KEYS_JSON || '[]'); } catch { throw new AgentError('auth_configuration_error', 503); }
  if (!Array.isArray(keys)) throw new AgentError('auth_configuration_error', 503);
  const digest = createHash('sha256').update(header.slice(7)).digest();
  const identity = keys.find(key => /^[a-f0-9]{64}$/i.test(key.sha256 || '') && timingSafeEqual(digest, Buffer.from(key.sha256, 'hex')));
  if (!identity || identity.revoked || !/^[\w-]{1,80}$/.test(identity.tenantId || '') || !/^[\w-]{1,80}$/.test(identity.id || '')) throw new AgentError('unauthorized', 401);
  if (identity.expiresAt && (!Number.isFinite(Date.parse(identity.expiresAt)) || Date.parse(identity.expiresAt) <= Date.now())) throw new AgentError('unauthorized', 401);
  if (!Array.isArray(identity.scopes) || !identity.scopes.includes(scope)) throw new AgentError('insufficient_scope', 403);
  return { tenantId: identity.tenantId, credentialId: identity.id };
}
