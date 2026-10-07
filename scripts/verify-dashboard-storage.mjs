import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { spawnSync, spawn } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
const dir = mkdtempSync('/private/tmp/dashboard-pg-');
// Local-only verification: this script always creates its own temporary DB.
const bin = process.env.PG_BIN || '/opt/homebrew/opt/postgresql@14/bin';
const repo = dirname(dirname(fileURLToPath(import.meta.url)));
const data = join(dir, 'data');
let started = false;
function run(name, args) {
  const r = spawnSync(join(bin, name), args, { encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`${name}: ${r.stderr || r.stdout}`);
  return r.stdout.trim();
}
const pgArgs = ['-h', dir, '-p', '55483', '-U', 'alex', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-At'];
const sql = s => run('psql', [...pgArgs, '-c', s]);
const sqlAsync = s => new Promise((resolve, reject) => {
  const p = spawn(join(bin,'psql'), [...pgArgs, '-c', s]); let out='', err='';
  p.stdout.on('data', c=>out+=c); p.stderr.on('data',c=>err+=c);
  p.on('error', reject); p.on('exit',code=>code===0?resolve(out.trim()):reject(new Error(err)));
});
try {
  run('initdb',['-D',data,'-A','trust','--no-locale']);
  run('pg_ctl',['-D',data,'-l',join(dir,'server.log'),'-o',`-h '' -k ${dir} -p 55483`,'-w','start']);
  started = true;
  sql('create role anon; create role authenticated; create role service_role bypassrls; grant usage on schema public to service_role;');
  sql(readFileSync(join(repo,'supabase/schema.sql'),'utf8'));
  const accessMigration = readFileSync(join(repo,'supabase/workspace-access.sql'),'utf8');
  sql(accessMigration); sql(accessMigration);
  for (const table of ['clients','audits','report_sends']) {
    assert.equal(sql(`select relrowsecurity from pg_class where oid='public.${table}'::regclass`),'t');
    for (const role of ['anon','authenticated']) assert.equal(sql(`select has_table_privilege('${role}','public.${table}','select,insert,update,delete')`),'f');
    for (const privilege of ['select','insert','update','delete']) assert.equal(sql(`select has_table_privilege('service_role','public.${table}','${privilege}')`),'t');
  }
  sql("set role service_role; insert into public.clients(domain) values('local-fixture.example'); reset role;");
  console.log('PASS: workspace migration applied/reapplied; RLS and server-only CRUD verified');
  const trackingDefinition = sql("select pg_get_functiondef('public.record_report_open(uuid)'::regprocedure)");
  const trackingMigration = readFileSync(join(repo,'supabase/report-tracking.sql'),'utf8');
  sql(trackingMigration); sql(trackingMigration);
  assert.equal(sql("select pg_get_functiondef('public.record_report_open(uuid)'::regprocedure)"),trackingDefinition);
  assert.equal(sql("select prosecdef from pg_proc where oid='public.record_report_open(uuid)'::regprocedure"),'f');
  assert.equal(sql("select proconfig::text from pg_proc where oid='public.record_report_open(uuid)'::regprocedure"),'{"search_path=\\"\\""}');
  for (const role of ['anon','authenticated']) {
    assert.equal(sql(`select has_function_privilege('${role}','public.record_report_open(uuid)','execute')`),'f');
    const denied = spawnSync(join(bin,'psql'),[...pgArgs,'-c',`set role ${role}; select public.record_report_open(null);`],{encoding:'utf8'});
    assert.notEqual(denied.status,0); assert.match(denied.stderr,/permission denied/);
  }
  const auditId = sql("insert into public.audits(domain,requested_url) values('local-fixture.example','https://local-fixture.example') returning id").split('\n')[0];
  const sendId = sql(`insert into public.report_sends(audit_id,domain,prospect_email) values('${auditId}','local-fixture.example','fixture@example.invalid') returning id`).split('\n')[0];
  const orphanId = sql("insert into public.report_sends(domain,prospect_email) values('local-fixture.example','orphan@example.invalid') returning id").split('\n')[0];
  const open = id => sqlAsync(`set role service_role; select public.record_report_open('${id}');`);
  assert.match(await open(sendId),new RegExp(auditId));
  const firstOpened = sql(`select first_opened_at from public.report_sends where id='${sendId}'`);
  const opens = await Promise.allSettled(Array.from({length:12},()=>open(sendId)));
  for (const result of opens) { assert.equal(result.status,'fulfilled'); assert.match(result.value,new RegExp(auditId)); }
  assert.equal(sql(`select open_count from public.report_sends where id='${sendId}'`),'13');
  assert.equal(sql(`select first_opened_at from public.report_sends where id='${sendId}'`),firstOpened);
  assert.equal(sql(`select last_opened_at >= first_opened_at from public.report_sends where id='${sendId}'`),'t');
  assert.equal(sql(`set role service_role; select public.record_report_open('${orphanId}') is null;`).split('\n').at(-1),'t');
  assert.equal(sql(`select open_count from public.report_sends where id='${orphanId}'`),'0');
  assert.equal(sql("set role service_role; select public.record_report_open('00000000-0000-0000-0000-000000000000') is null;").split('\n').at(-1),'t');
  assert.equal(sql("set role service_role; select public.record_report_open(null) is null;").split('\n').at(-1),'t');
  sql(`delete from public.audits where id='${auditId}'`);
  assert.equal(sql(`set role service_role; select public.record_report_open('${sendId}') is null;`).split('\n').at(-1),'t');
  console.log('PASS: tracking schema/migration parity and reapplication; invoker rights, empty search path, browser-role denial, 12 concurrent opens, stable first-open time, null/missing/orphan/deleted sends');
  if (!process.argv.includes('--tracking-only')) {
    const migration = readFileSync(join(repo,'supabase/dashboard-admission.sql'),'utf8');
    sql(migration); sql(migration);
    run('psql',[...pgArgs,'-f',join(repo,'tests/dashboard-admission.sql')]);
    console.log('PASS: migration applied/reapplied and SQL regression checks');
    const concurrent = await Promise.allSettled(Array.from({length:8},(_,i)=>sqlAsync(`select public.reserve_dashboard_audit('dashboard:preview','${String(i).repeat(64)}');`)));
    for (const r of concurrent) if (r.status !== 'fulfilled') throw r.reason;
    const rows = concurrent.map(r=>JSON.parse(r.value));
    const leases = rows.filter(r=>r.leaseId);
    assert.equal(leases.length, 2);
    assert.equal(new Set(leases.map(r=>r.leaseId)).size,2);
    assert.equal(rows.filter(r=>r.error==='busy').length,6);
    assert.equal(sql("select count(*) from public.dashboard_audit_leases where scope='dashboard:preview'"),'2');
    console.log('PASS: eight simultaneous clients admitted exactly two distinct leases; six busy');
    sql('truncate public.dashboard_audit_attempts, public.dashboard_audit_leases;');
    const sameClient = await Promise.allSettled(Array.from({length:8},()=>sqlAsync(`select public.reserve_dashboard_audit('dashboard:preview','${'a'.repeat(64)}');`)));
    for (const r of sameClient) if (r.status !== 'fulfilled') throw r.reason;
    const sameRows = sameClient.map(r=>JSON.parse(r.value));
    assert.equal(sameRows.filter(r=>r.leaseId).length,2);
    assert.equal(sameRows.filter(r=>r.error==='busy').length,3);
    assert.equal(sameRows.filter(r=>r.error==='rate_limit').length,3);
    console.log('PASS: eight simultaneous same-client attempts observed the five-request limit and two-audit ceiling');
    for (const role of ['anon','authenticated']) {
      const r = spawnSync(join(bin,'psql'),[...pgArgs,'-c',`set role ${role}; select public.reserve_dashboard_audit('dashboard:preview','${'b'.repeat(64)}');`],{encoding:'utf8'});
      assert.notEqual(r.status,0); assert.match(r.stderr,/permission denied/);
    }
    console.log('PASS: anonymous/authenticated roles cannot call the admission RPC');
  }
} finally {
  if(started) run('pg_ctl',['-D',data,'-w','stop']);
  rmSync(dir,{recursive:true,force:true});
}
