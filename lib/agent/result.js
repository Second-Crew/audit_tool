import { createHash } from 'node:crypto';
export const METHODOLOGY_VERSION='evidence-1.0';
const hash=value=>createHash('sha256').update(value).digest('hex').slice(0,24);

// Eligibility is re-evaluated when results are read, including revocation/freshness.
// No checks are certified merely because their implementation tests pass.
export function applyOutreachPolicy(result, env=process.env, now=Date.now()) {
  let registry=[];
  try {registry=JSON.parse(env.AGENT_VALIDATED_CHECKS_JSON || '[]');}catch{/* Fail closed. */}
  if(!Array.isArray(registry)) registry=[];
  return {...result, findings:(result.findings || []).map(finding=>{
    const certification=registry.find(item=>item.checkId===finding.checkId && item.methodologyVersion===result.methodologyVersion && item.profile===result.profile.value && item.benchmarkId);
    let reason='check_not_validated';
    const age=now-Date.parse(finding.observedAt);
    if(!Number.isFinite(age)||age<0||age>24*60*60*1000) reason='evidence_stale';
    else if(finding.status!=='fail') reason='not_verified_defect';
    else if(!finding.evidenceIds?.length || !finding.allowedWording || finding.scope!=='page_html') reason='insufficient_evidence';
    else if(finding.limitations.length) reason='incomplete_page_evidence';
    else if(result.profile.requiresReview) reason='profile_requires_review';
    else if(certification) reason='eligible';
    return {...finding,outreachEligible:reason==='eligible',eligibilityReason:reason};
  })};
}
export function buildAgentResult(audit,{id=null,profile='auto'}={}) {
  const signals=audit.primary.signals;
  const observedAt=audit.createdAt;
  const evidence=[]; const checks=[];
  function add(page,checkId,status,observation,recommendation,weight=1,allowedWording=null) {
    const id=hash(`${METHODOLOGY_VERSION}:${page.url}:${checkId}`);
    const evidenceId=`ev_${id}`;
    const checkedAt=page.observedAt || observedAt;
    evidence.push({id:evidenceId,url:page.url,requestedUrl:page.requestedUrl,observedAt:checkedAt,source:page.evidenceSource || 'fetched_html',sourceHash:page.sourceHash,httpStatus:page.status,observation,hash:hash(JSON.stringify(observation))});
    checks.push({id:`finding_${id}`,checkId,status,scope:'page_html',affectedUrls:[page.url],observedAt:checkedAt,evidenceIds:[evidenceId],
      severity:'review',recommendation,acceptanceTest:`Fetch ${page.url} and repeat ${checkId}.`,weight,
      allowedWording:status==='fail'?allowedWording:null,limitations:page.technical.truncated?['truncated_html']:page.text.length<80?['insufficient_extracted_content']:page.evidenceSource==='rendered_dom'?['rendered_dom_not_validated_for_outreach']:[],outreachEligible:false,eligibilityReason:'check_not_validated'});
  }
  for(const page of signals.pages) {
    const incomplete=page.technical.truncated || page.text.length<80;
    add(page,'html.title',page.title?'pass':incomplete?'unknown':'fail',{title:page.title || null},'Provide a descriptive title for this page.',2,`Our scan did not find a non-empty title in the HTML returned for ${page.url}.`);
    add(page,'html.description',page.metaDescription?'pass':incomplete?'unknown':'fail',{metaDescription:page.metaDescription || null},'Consider a useful page-specific meta description.',1,`Our scan did not find a non-empty meta description in the HTML returned for ${page.url}.`);
    add(page,'index.permission',!page.indexable?'needs_review':incomplete?'unknown':'pass',page.indexing,'Confirm whether this page is intended for search indexing before changing directives.',3);
    add(page,'schema.json_syntax',page.schema.invalid.length?'fail':page.schema.found?'pass':incomplete?'unknown':'not_applicable',{invalidBlocks:page.schema.invalid.map(b=>({message:b.message})),nodes:page.schema.count},'Repair invalid JSON-LD syntax; schema absence alone is not a defect.',1);
    const stubs=page.schema.nodes.filter(node=>!node.name && Object.keys(node.raw).every(key=>key.startsWith('@')));
    add(page,'schema.meaningful_fields',stubs.length?'needs_review':page.schema.found?'pass':incomplete?'unknown':'not_applicable',{stubTypes:stubs.map(n=>n.type),validationScope:'Type-only stub detection; not rich-result validation'},'Review required properties for applicable types and match them to page content.',1);
    add(page,'forms.accessible_names',page.forms.inputs===0?'not_applicable':page.forms.likelyLabeled?'pass':'fail',{controls:page.forms.inputs,namedControls:page.forms.named},'Give every applicable form control an accessible name.',1);
  }
  const basics=checks.filter(c=>['html.title','html.description','index.permission'].includes(c.checkId));
  const assessed=basics.filter(c=>['pass','fail'].includes(c.status));
  const expectedWeight=basics.reduce((s,c)=>s+c.weight,0);
  const assessedWeight=assessed.reduce((s,c)=>s+c.weight,0);
  const coverage=expectedWeight?assessedWeight/expectedWeight:0;
  const review=basics.some(c=>c.status==='needs_review');
  const categoryScore=coverage>=0.8 && !review && assessedWeight ? Math.round(100*assessed.filter(c=>c.status==='pass').reduce((s,c)=>s+c.weight,0)/assessedWeight):null;
  const suggested=signals.commerce.likelyEcommerce?'ecommerce':['marketing','corporate'].includes(signals.siteType?.value)?'mixed':signals.saas.likelySaas?'b2b_saas':signals.local.hasAddress||signals.local.city?'local_services':signals.content.educationalPages.length?'publisher':'mixed';
  const summary=signals.crawl.summary;
  return applyOutreachPolicy({schemaVersion:'1.0',methodologyVersion:METHODOLOGY_VERSION,auditId:id,createdAt:observedAt,
    siteType:signals.siteType,
    target:{requestedUrl:audit.input.url,domain:signals.domain},profile:{value:profile==='auto'?suggested:profile,source:profile==='auto'?'heuristic_suggestion':'caller',requiresReview:profile==='auto'},
    coverage:{pagesCrawled:signals.pageCount,pageBudget:audit.input.limits.maxPages,stoppedBy:summary.stoppedBy,failedRequests:summary.failedRequests,blockedPaths:summary.blockedByRobots,siteComplete:false,rendered:signals.contentEvidence?.renderedPages>0,renderedPages:signals.contentEvidence?.renderedPages||0,contentCoverage:signals.contentEvidence?.coverage??null},
    scores:{overall:null,fetchedPageBasics:{score:categoryScore,coverage,weights:{title:2,description:1,indexPermission:3},scope:'sampled_pages',provisional:true},answerUsefulness:null,entityClarity:null,observedAiVisibility:null},
    limitations:[signals.contentEvidence?.status==='incomplete'?'Content extraction incomplete; content and composite grades withheld.':'Sampled pages only; no site-wide completeness claim.','The basics score is a provisional technical checklist, not SEO rank or AI visibility.','Semantic calibration and external AI visibility measurement are not completed.'],
    findings:checks,evidence,
    semantic:audit.semantic ? {status:audit.semantic.status,model:audit.semantic.model,rubricVersion:audit.semantic.rubricVersion,experimental:true,outreachEligible:false,score:null,coverage:audit.semantic.coverage,usage:audit.semantic.usage}:null,
    botAccess:signals.robots.botAccess,
    performance:{source:'pagespeed_lighthouse',scope:'requested_url',observedAt,scores:audit.pageSpeed.scores,metrics:audit.pageSpeed.metrics},
  });
}
