import { afterEach, describe, expect, it, vi } from 'vitest';
import { generateAuditNarrative } from '../lib/audit/llm.js';

afterEach(()=>vi.unstubAllEnvs());

describe('client narrative gate',()=>{
  it('uses deterministic report text by default even when a provider key exists',async()=>{
    vi.stubEnv('GEMINI_API_KEY','configured-provider-key');
    vi.stubEnv('AUDIT_GENERATED_NARRATIVE_ENABLED','false');
    const result=await generateAuditNarrative({});
    expect(result).toMatchObject({enabled:false,status:'skipped',output:null});
    expect(result.reason).toContain('claim-level validation');
  });
});
