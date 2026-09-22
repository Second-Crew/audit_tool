import {beforeEach,afterEach,describe,it,expect,vi} from 'vitest';
import {accessToken,ACCESS_COOKIE} from '../lib/access.js';
vi.mock('../lib/evaluation/claim-evaluation.js',()=>({runClaimEvaluation:vi.fn().mockResolvedValue({productionApproved:false,rows:[]})}));
import {POST} from '../app/api/internal/claim-evaluation/route.js';
import {runClaimEvaluation} from '../lib/evaluation/claim-evaluation.js';
beforeEach(()=>{vi.stubEnv('VERCEL_ENV','preview');vi.stubEnv('APP_ACCESS_PASSWORD','fixture-only');vi.stubEnv('TYPESAFE_API_KEY','fixture-only');vi.clearAllMocks();});
afterEach(()=>vi.unstubAllEnvs());
async function request(origin='https://preview.example',auth=true){return new Request('https://preview.example/api/internal/claim-evaluation',{method:'POST',headers:{Origin:origin,...(auth?{Cookie:`${ACCESS_COOKIE}=${await accessToken('fixture-only')}`}:{})}});}
describe('internal evaluation boundary',()=>{
 it('rejects production even with a valid session',async()=>{vi.stubEnv('VERCEL_ENV','production');expect((await POST(await request())).status).toBe(403);expect(runClaimEvaluation).not.toHaveBeenCalled();});
 it('requires cookie authentication independently of middleware',async()=>{expect((await POST(await request(undefined,false))).status).toBe(401);expect(runClaimEvaluation).not.toHaveBeenCalled();});
 it('rejects cross-origin requests before spending tokens',async()=>{expect((await POST(await request('https://other.example'))).status).toBe(403);expect(runClaimEvaluation).not.toHaveBeenCalled();});
 it('runs only fixed inputs and caches an authenticated development evaluation',async()=>{const response=await POST(await request());expect(response.status).toBe(200);expect(runClaimEvaluation).toHaveBeenCalledWith();expect((await(await POST(await request())).json()).cached).toBe(true);expect(runClaimEvaluation).toHaveBeenCalledTimes(1);});
});
