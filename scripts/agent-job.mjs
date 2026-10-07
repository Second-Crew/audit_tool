import { runAudit } from '../lib/audit/index.js';
import { buildAgentResult } from '../lib/agent/result.js';
process.once('message',async({id,input})=>{
  try {
    const {audit}=await runAudit({...input,competitors:[],maxDurationMs:150000,skipNarrative:true},event=>process.send?.({type:'progress',stage:event.stage}));
    process.send?.({type:'result',result:buildAgentResult(audit,{id,profile:input.profile})},()=>process.exit(0));
  }catch{process.send?.({type:'error'},()=>process.exit(1));}
});
