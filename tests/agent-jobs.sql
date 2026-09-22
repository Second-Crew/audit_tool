-- Run only against an isolated test database after supabase/agent-jobs.sql.
begin;
do $$
declare a jsonb; b jsonb; first_claim jsonb; second_claim jsonb; n integer;
begin
  a:=enqueue_agent_audit('test-a','key-a','same-key','hash-a','{"url":"https://example.com"}');
  b:=enqueue_agent_audit('test-a','key-a','same-key','hash-a','{"url":"https://example.com"}');
  if a->'job'->>'id' <> b->'job'->>'id' or b->>'replayed' <> 'true' then raise exception 'idempotency failed'; end if;
  b:=enqueue_agent_audit('test-a','key-a','same-key','different','{}');
  if b->>'error' <> 'idempotency_conflict' then raise exception 'conflict missing'; end if;
  b:=enqueue_agent_audit('test-b','key-b','same-key','hash-a','{}');
  if a->'job'->>'id' = b->'job'->>'id' then raise exception 'tenant key collision'; end if;
  perform enqueue_agent_audit('test-a','key-a','second','h2','{}');
  b:=enqueue_agent_audit('test-a','key-a','third','h3','{}');
  if b->>'error' <> 'queue_limit' then raise exception 'quota not enforced'; end if;
  first_claim:=claim_agent_audit(); second_claim:=claim_agent_audit();
  if first_claim->>'id'=second_claim->>'id' then raise exception 'duplicate claim'; end if;
  if claim_agent_audit() is not null then raise exception 'global concurrency exceeded'; end if;
  update agent_audit_jobs set created_at=now()-interval '2 minutes',lease_until=now()-interval '1 minute' where id=(first_claim->>'id')::uuid;
  b:=claim_agent_audit();
  if b->>'id'<>first_claim->>'id' or b->>'lease_token'=first_claim->>'lease_token' then raise exception 'lease recovery failed'; end if;
  update agent_audit_jobs set result='{"bad":true}' where id=(first_claim->>'id')::uuid and lease_token=(first_claim->>'lease_token')::uuid and status='running';
  get diagnostics n=row_count;
  if n<>0 then raise exception 'stale writer accepted'; end if;
  update agent_audit_jobs set lease_until=now()-interval '1 minute' where id=(b->>'id')::uuid;
  perform claim_agent_audit();
  if (select status from agent_audit_jobs where id=(b->>'id')::uuid)<>'failed' then raise exception 'retry ceiling failed'; end if;
  if has_function_privilege('anon','public.claim_agent_audit()','EXECUTE') then raise exception 'public claim access'; end if;
  if has_table_privilege('authenticated','public.agent_audit_jobs','SELECT') then raise exception 'direct user table access'; end if;
  raise notice 'PASS: idempotency, conflicts, tenant key isolation, quotas, leases, retry ceiling and role restrictions';
end $$;
rollback;
