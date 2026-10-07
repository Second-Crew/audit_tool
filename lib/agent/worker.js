import { fork } from 'node:child_process';
import { rpc, updateLease } from './store.js';
const CHILD_URL=new URL('../../scripts/agent-job.mjs',import.meta.url);
// A separate process provides a hard wall-clock bound, including stuck providers.
export async function runWorkerOnce({claim=()=>rpc('claim_agent_audit'),update=updateLease,spawn=()=>fork(CHILD_URL,[],{execArgv:[],stdio:['ignore','ignore','ignore','ipc']}),deadlineMs=300000,heartbeatMs=20000}={}) {
  const job=await claim(); if(!job) return false;
  const child=spawn(); let result=null; let errorCode=null; let lost=false; let stage='starting'; let pumping=false;
  const heartbeat=setInterval(async()=>{
    if(pumping) return; pumping=true;
    try {
      const rows=await update(job,{stage,lease_until:new Date(Date.now()+90000).toISOString()});
      if(!rows?.length){lost=true;child.kill('SIGKILL');}
    }catch{lost=true;child.kill('SIGKILL');}finally{pumping=false;}
  },heartbeatMs);
  const timeout=setTimeout(()=>{errorCode='audit_time_budget_exceeded';child.kill('SIGKILL');},deadlineMs);
  try {
    await new Promise(resolve=>{
      child.on('message',message=>{
        if(message.type==='progress') stage=String(message.stage || 'running').slice(0,40);
        if(message.type==='result') result=message.result;
        if(message.type==='error') errorCode='audit_failed';
      });
      child.on('error',()=>{errorCode='worker_error';resolve();});
      child.on('exit',resolve);
      child.send({id:job.id,input:job.input});
    });
  }finally{clearInterval(heartbeat);clearTimeout(timeout);}
  if(!lost) await update(job,result && !errorCode?{status:result.coverage.failedRequests||result.coverage.stoppedBy!=='queue_empty'?'partial':'completed',stage:'done',result,lease_until:null}:{status:'failed',stage:'failed',error_code:errorCode || 'worker_exit',lease_until:null});
  return true;
}
