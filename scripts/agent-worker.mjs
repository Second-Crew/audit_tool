import { runWorkerOnce } from '../lib/agent/worker.js';
if(!process.env.SUPABASE_URL||!process.env.SUPABASE_SERVICE_ROLE_KEY) throw new Error('Worker needs server-side Supabase configuration');
let stopping=false;
process.on('SIGTERM',()=>{stopping=true;});process.on('SIGINT',()=>{stopping=true;});
do {
  try {const worked=await runWorkerOnce(); if(!worked&&!process.argv.includes('--once')) await new Promise(r=>setTimeout(r,5000));}
  catch {console.error('Worker storage unavailable; retrying in 10 seconds');await new Promise(r=>setTimeout(r,10000));}
} while(!stopping&&!process.argv.includes('--once'));
