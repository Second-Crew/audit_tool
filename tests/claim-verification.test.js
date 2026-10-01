import {describe,it,expect,vi} from 'vitest';
import {verifyClaim,quotePresent} from '../lib/audit/claim-verification.js';
import {runClaimEvaluation,summarizePredictions} from '../lib/evaluation/claim-evaluation.js';
const input={claim:'This page allows returns within 30 days.',quote:'Returns are accepted within 30 days.',source:'Returns are accepted within 30 days. Used items are excluded.',sourceUrl:'https://fixture.example/returns'};
function answer(choice='supported',confidence=.95){return{model:'jev-1.13.0',usage:{input_tokens:100,output_tokens:10},answers:{support:{type:'choice',choice,confidence,probabilities:Object.fromEntries(['supported','contradicted','insufficient'].map(k=>[k,k===choice?1:0]))}}};}
describe('claim support verification',()=>{
 it('rejects missing quotes without spending model tokens',async()=>{
  const client={systemOne:vi.fn()};const result=await verifyClaim({...input,quote:'Free shipping worldwide.'},{client});
  expect(result.verdict).toBe('fabricated');expect(result.wouldAccept).toBe(false);expect(client.systemOne).not.toHaveBeenCalled();
 });
 it('normalizes whitespace but does not accept short quote fragments',()=>{
  expect(quotePresent('Returns are\naccepted within 30 days.',input.quote)).toBe(true);expect(quotePresent(input.source,'Returns')).toBe(false);
 });
 it('passes source context to one narrow judgment and never authorizes outreach',async()=>{
  const client={systemOne:vi.fn().mockResolvedValue(answer())};const result=await verifyClaim(input,{client});
  expect(client.systemOne.mock.calls[0][0].state.source).toBe(input.source);expect(result.wouldAccept).toBe(true);expect(result.outreachEligible).toBe(false);
 });
 it.each(['contradicted','insufficient'])('rejects %s even when quote is present',async choice=>{
  const result=await verifyClaim(input,{client:{systemOne:vi.fn().mockResolvedValue(answer(choice))}});expect(result.status).toBe('rejected');
 });
 it('routes low confidence and incomplete source to review/unavailable',async()=>{
  const result=await verifyClaim(input,{client:{systemOne:vi.fn().mockResolvedValue(answer('supported',.3))}});expect(result.status).toBe('needs_review');expect(result.wouldAccept).toBe(false);
  const client={systemOne:vi.fn()};expect((await verifyClaim({...input,sourceTruncated:true},{client})).reason).toBe('incomplete_source');expect(client.systemOne).not.toHaveBeenCalled();
 });
 it('rejects malformed probability distributions and strips errors',async()=>{
  const invalid=answer();invalid.answers.support.probabilities={supported:1};
  expect((await verifyClaim(input,{client:{systemOne:vi.fn().mockResolvedValue(invalid)}})).reason).toBe('invalid_provider_judgment');
  const failed=await verifyClaim(input,{client:{systemOne:vi.fn().mockRejectedValue(new Error('secret API key'))}});expect(JSON.stringify(failed)).not.toContain('secret');expect(failed.wouldAccept).toBe(false);
 });
 it('reports null precision if nothing is accepted, rather than claiming perfect accuracy',()=>{
  expect(summarizePredictions([{expected:'supported'}],()=>false).precision).toBeNull();
 });
 it('compares model decisions with quote-only acceptance and discloses synthetic scope',async()=>{
  const cases=[{...input,id:'a',profile:'ecommerce',expected:'supported'},{...input,id:'b',profile:'ecommerce',expected:'contradicted'}];
  const verify=vi.fn().mockResolvedValueOnce({verdict:'supported',status:'supported',wouldAccept:true}).mockResolvedValueOnce({verdict:'contradicted',status:'rejected',wouldAccept:false});
  const result=await runClaimEvaluation({cases,verify});expect(result.metrics.precision).toBe(1);expect(result.quoteOnlyBaseline.precision).toBe(.5);expect(result.productionApproved).toBe(false);expect(result.metrics.precisionInterval95.lower).toBeLessThan(.5);
 });
});
