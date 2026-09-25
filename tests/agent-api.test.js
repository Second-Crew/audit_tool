import { beforeEach,describe,it,expect,vi } from 'vitest';
import { createHash } from 'node:crypto';
import { authenticateAgent } from '../lib/agent/auth.js';
import { validateAgentInput } from '../lib/agent/input.js';
import { applyOutreachPolicy } from '../lib/agent/result.js';
import { readBody } from '../lib/agent/http.js';
const token='a'.repeat(48);
const env={AGENT_API_ENABLED:'true',AGENT_API_KEYS_JSON:JSON.stringify([{id:'test',tenantId:'crew',sha256:createHash('sha256').update(token).digest('hex'),scopes:['audits:read']}])};
const request=()=>new Request('https://audit.example/api/v1/audits',{headers:{Authorization:`Bearer ${token}`}});
describe('machine authentication',()=>{
  it('fails closed when disabled or unauthenticated even with a dashboard cookie',()=>{
    expect(()=>authenticateAgent(request(),'audits:read',{})).toThrow('api_disabled');
    expect(()=>authenticateAgent(new Request('https://audit.example',{headers:{Cookie:'access=whatever'}}),'audits:read',env)).toThrow('unauthorized');
  });
  it('enforces scopes, expiry, revocation and malformed config',()=>{
    expect(authenticateAgent(request(),'audits:read',env)).toEqual({tenantId:'crew',credentialId:'test'});
    expect(()=>authenticateAgent(request(),'audits:create',env)).toThrow('insufficient_scope');
    for(const overrides of [{revoked:true},{expiresAt:'2000-01-01'},{expiresAt:'bad'},{tenantId:''}]) {
      const keys=JSON.parse(env.AGENT_API_KEYS_JSON);Object.assign(keys[0],overrides);
      expect(()=>authenticateAgent(request(),'audits:read',{...env,AGENT_API_KEYS_JSON:JSON.stringify(keys)})).toThrow('unauthorized');
    }
    expect(()=>authenticateAgent(request(),'audits:read',{...env,AGENT_API_KEYS_JSON:'oops'})).toThrow('auth_configuration_error');
  });
});
describe('agent input budgets',()=>{
  it('rejects unsupported options, credentials and invalid page counts',()=>{
    for(const body of [{url:'https://example.com',maxPages:1000},{url:'https://example.com',maxPages:1.2},{url:'https://example.com',callbackUrl:'https://evil.example'},{url:'https://user:pass@example.com'},{url:'https://example.com:8080'}]) expect(()=>validateAgentInput(body)).toThrow();
    expect(validateAgentInput({url:'example.com',profile:'ecommerce'})).toMatchObject({maxPages:50,profile:'ecommerce'});
  });
  it('bounds actual streamed body bytes, not just Content-Length',async()=>{
    const req=new Request('https://audit.example',{method:'POST',body:'x'.repeat(8200)});
    await expect(readBody(req)).rejects.toThrow('body_too_large');
  });
});
describe('outreach eligibility',()=>{
  const now=Date.now();
  const result={methodologyVersion:'evidence-1.0',profile:{value:'ecommerce'},findings:[{checkId:'html.title',status:'fail',scope:'page_html',observedAt:new Date(now).toISOString(),evidenceIds:['e1'],allowedWording:'Observed fact',limitations:[]}]};
  const approved={AGENT_VALIDATED_CHECKS_JSON:JSON.stringify([{checkId:'html.title',methodologyVersion:'evidence-1.0',profile:'ecommerce',benchmarkId:'review-123'}])};
  it('requires explicit per-check/profile/methodology validation',()=>{
    expect(applyOutreachPolicy(result,{},now).findings[0].outreachEligible).toBe(false);
    expect(applyOutreachPolicy(result,approved,now).findings[0].outreachEligible).toBe(true);
    expect(applyOutreachPolicy({...result,profile:{value:'publisher'}},approved,now).findings[0].outreachEligible).toBe(false);
  });
  it('revokes stale and incomplete evidence at read time',()=>{
    expect(applyOutreachPolicy(result,approved,now+86400001).findings[0].eligibilityReason).toBe('evidence_stale');
    const partial={...result,findings:[{...result.findings[0],limitations:['truncated_html']}]};
    expect(applyOutreachPolicy(partial,approved,now).findings[0].outreachEligible).toBe(false);
  });
});
