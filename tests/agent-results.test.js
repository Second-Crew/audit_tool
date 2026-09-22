import {describe,it,expect} from 'vitest';
import {extractSiteSignals} from '../lib/audit/extractors.js';
import {scoreSite} from '../lib/audit/scoring.js';
import {buildAgentResult} from '../lib/agent/result.js';
function make(html,headers={},truncated=false) {
 const crawl={domain:'example.com',origin:'https://example.com',startUrl:'https://example.com/',pages:[{url:'https://example.com/services/plumbing',status:200,headers,html,truncated}],errors:[],blockedByRobots:[],summary:{stoppedBy:'queue_empty',failedRequests:0,blockedByRobots:0},auxiliary:{robots:{found:true,status:200,body:'User-agent: *\nAllow: /'},llms:{found:false,body:''},sitemap:{found:false,urls:[]}}};
 const signals=extractSiteSignals(crawl);
 const pageSpeed={scores:{},metrics:{},available:false};
 return {createdAt:new Date().toISOString(),input:{url:crawl.startUrl,limits:{maxPages:50}},primary:{signals,scoring:scoreSite(signals,pageSpeed)},pageSpeed};
}
const content='<main><h1>Plumbing services</h1><p>We install and repair drains, pipes and fixtures. Call our team to discuss your plumbing requirements and book a visit.</p></main>';
describe('evidence result and scoring regressions',()=>{
 it('keeps a service page classified despite navigation and removes script trust claims',()=>{
  const audit=make('<title>Plumbing</title><nav>Contact About Pricing</nav><script>certified case study FAQ</script>'+content);
  expect(audit.primary.signals.pages[0].contentType).toBe('service');
  expect(audit.primary.signals.entity.hasCredentials).toBe(false);
  expect(audit.primary.signals.content.faqPages).toHaveLength(0);
 });
 it('does not fabricate a performance grade or llms penalty',()=>{
  const audit=make(content);
  expect(audit.primary.scoring.categoryDetails.pageExperience.score).toBeNull();
  expect(audit.primary.scoring.categoryDetails.pageExperience.checks.find(c=>c.status==='unknown').score).toBeNull();
  expect(audit.primary.scoring.findings.some(f=>f.title.includes('llms'))).toBe(false);
 });
 it('withholds indexing grades until intent review and cites the actual header',()=>{
  const result=buildAgentResult(make('<title>Plumbing</title>'+content,{'x-robots-tag':'noindex'}));
  expect(result.scores.fetchedPageBasics.score).toBeNull();
  const finding=result.findings.find(f=>f.checkId==='index.permission');
  expect(finding.status).toBe('needs_review');expect(finding.outreachEligible).toBe(false);
  expect(result.evidence.find(e=>e.id===finding.evidenceIds[0]).observation.sources[0].value).toBe('noindex');
 });
 it('never treats incomplete HTML absence as a defect',()=>{
  const result=buildAgentResult(make(content,{},true));
  expect(result.findings.find(f=>f.checkId==='html.title').status).toBe('unknown');
  expect(result.findings.every(f=>!f.outreachEligible)).toBe(true);
 });
 it('detects nested schema and flags type-only stubs for review',()=>{
  const audit=make('<script type="application/ld+json">{"@type":"Product","name":"Pipe","offers":{"@type":"Offer","price":10}}</script>'+content);
  expect(audit.primary.signals.schema.types).toContain('Offer');
  const stub=buildAgentResult(make('<script type="application/ld+json">{"@type":"Product"}</script>'+content));
  expect(stub.findings.find(f=>f.checkId==='schema.meaningful_fields').status).toBe('needs_review');
 });
 it('is honest about unmeasured overall/AI scores and profile certainty',()=>{
  const result=buildAgentResult(make(content),{id:'qa',profile:'ecommerce'});
  expect(result.profile).toEqual({value:'ecommerce',source:'caller',requiresReview:false});
  expect(result.scores.overall).toBeNull();expect(result.scores.observedAiVisibility).toBeNull();
  expect(result.findings.find(f=>f.checkId==='html.title').allowedWording).toContain('HTML returned');
 });
});
