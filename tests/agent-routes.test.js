import { beforeEach,afterEach,describe,it,expect,vi } from 'vitest';
import { createHash } from 'node:crypto';
vi.mock('../lib/audit/url.js',()=>({normalizeAuditUrl:v=>new URL(v).toString(),assertPublicHttpUrl:vi.fn().mockResolvedValue([])}));
vi.mock('../lib/agent/store.js',()=>({rpc:vi.fn(),getJob:vi.fn(),cancelJob:vi.fn(),publicJob:j=>({id:j.id,status:j.status})}));
import { rpc,getJob } from '../lib/agent/store.js';
import { POST } from '../app/api/v1/audits/route.js';
import { GET } from '../app/api/v1/audits/[id]/route.js';
import { GET as resultGET } from '../app/api/v1/audits/[id]/result/route.js';
const key='b'.repeat(48);
function req(path='/api/v1/audits',method='POST',body={url:'https://example.com'}) {return new Request(`https://audit.example${path}`,{method,headers:{Authorization:`Bearer ${key}`,'Idempotency-Key':'test-key-123','Content-Type':'application/json'},...(method==='POST'?{body:JSON.stringify(body)}:{})});}
beforeEach(()=>{vi.clearAllMocks();vi.stubEnv('AGENT_API_ENABLED','true');vi.stubEnv('AGENT_API_KEYS_JSON',JSON.stringify([{id:'ci',tenantId:'tenant-a',sha256:createHash('sha256').update(key).digest('hex'),scopes:['audits:create','audits:read']} ]));});
afterEach(()=>vi.unstubAllEnvs());
describe('agent HTTP contract',()=>{
  it('returns an immediate 202 and hands normalized input to the atomic queue',async()=>{
    rpc.mockResolvedValue({job:{id:'job1',status:'queued'},replayed:false});
    const response=await POST(req());expect(response.status).toBe(202);expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(rpc).toHaveBeenCalledWith('enqueue_agent_audit',expect.objectContaining({p_tenant:'tenant-a',p_credential:'ci',p_key:'test-key-123',p_input:expect.objectContaining({maxPages:50})}));
  });
  it('returns replay and conflict instead of starting duplicate work',async()=>{
    rpc.mockResolvedValueOnce({job:{id:'job1',status:'queued'},replayed:true}).mockResolvedValueOnce({error:'idempotency_conflict'});
    expect((await POST(req())).status).toBe(200);expect((await POST(req())).status).toBe(409);
  });
  it('passes authenticated tenant ownership to reads and withholds pending results',async()=>{
    getJob.mockResolvedValue({id:'job1',status:'running'});
    expect((await GET(req('/api/v1/audits/job1','GET'),{params:{id:'job1'}})).status).toBe(200);
    expect(getJob).toHaveBeenCalledWith('job1','tenant-a');
    expect((await resultGET(req('/api/v1/audits/job1/result','GET'),{params:{id:'job1'}})).status).toBe(409);
  });
  it('never exposes backend error details',async()=>{
    rpc.mockRejectedValue(new Error('postgres secret credentials'));
    const response=await POST(req());expect(response.status).toBe(503);expect(JSON.stringify(await response.json())).not.toContain('secret');
  });
});
