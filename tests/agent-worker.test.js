import {describe,it,expect,vi} from 'vitest';
import {EventEmitter} from 'node:events';
import {runWorkerOnce} from '../lib/agent/worker.js';
function child(run) {const c=new EventEmitter();c.kill=vi.fn(()=>{queueMicrotask(()=>c.emit('exit',1));});c.send=()=>run(c);return c;}
const job={id:'test',lease_token:'lease',input:{url:'https://example.com'}};
describe('worker lifecycle',()=>{
  it('persists success and avoids starting work on an empty queue',async()=>{
    const update=vi.fn().mockResolvedValue([job]);
    const spawn=()=>child(c=>queueMicrotask(()=>{c.emit('message',{type:'result',result:{coverage:{stoppedBy:'queue_empty',failedRequests:0}}});c.emit('exit',0);}));
    expect(await runWorkerOnce({claim:async()=>job,update,spawn})).toBe(true);
    expect(update).toHaveBeenLastCalledWith(job,expect.objectContaining({status:'completed'}));
    const unused=vi.fn();expect(await runWorkerOnce({claim:async()=>null,spawn:unused})).toBe(false);expect(unused).not.toHaveBeenCalled();
  });
  it('kills a hung audit at the deadline and reports failure',async()=>{
    const update=vi.fn().mockResolvedValue([job]);const c=child(()=>{});
    await runWorkerOnce({claim:async()=>job,update,spawn:()=>c,deadlineMs:20});
    expect(c.kill).toHaveBeenCalled();expect(update).toHaveBeenLastCalledWith(job,expect.objectContaining({status:'failed',error_code:'audit_time_budget_exceeded'}));
  });
  it('stops on cancellation or ownership loss and does not overwrite it',async()=>{
    const update=vi.fn().mockResolvedValue([]);const c=child(()=>{});
    await runWorkerOnce({claim:async()=>job,update,spawn:()=>c,heartbeatMs:10,deadlineMs:1000});
    expect(c.kill).toHaveBeenCalled();expect(update).toHaveBeenCalledTimes(1);
  });
});
