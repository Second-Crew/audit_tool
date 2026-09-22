# Agent API v1

This build prepares agent workflows without sending email or activating external integrations. The API is **disabled by default**. Use `docs/agent-openapi.json` as the contract. The current evidence methodology is `evidence-1.0`; it is provisional and does not certify ranking, revenue impact or AI visibility.

## Deploy the API and worker

1. Apply `supabase/agent-jobs.sql` using a database administrator in a separate Preview database first. The migration creates one RLS-protected table and two service-role-only functions; it does not modify existing reports. Match the API and worker Supabase project. Use separate production and Preview databases.
2. Configure server-only `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` on the API and persistent worker. Never use the dashboard password or Supabase service key as an agent's bearer token.
3. Provision a random bearer token with at least 32 bytes of cryptographic randomness. Store its SHA-256 digest, credential ID, tenant ID, scopes and optional expiry in `AGENT_API_KEYS_JSON`. Give the raw token only to the intended workflow's secret store. A token grants access to all agent jobs in its configured tenant; create separate tenants for customers requiring isolation. This build does not provide a credential management UI.
4. Set `AGENT_API_ENABLED=true` only after migration and worker health checks. Remove a key entry or set `revoked:true` to revoke it. Allow scopes `audits:create`, `audits:read`, `audits:cancel` only where needed. Rotation uses a new random token and removing the old digest. No cookies grant API access.
5. Run `npm ci`, then `npm run agent:worker` on an always-on Node 20+ host (Node 24 recommended) with a process supervisor. This is not an in-process Next.js task or a Vercel request. Two workers at most claim jobs globally. A worker polls every five seconds; a five-minute process deadline and renewable 90-second lease bound execution. Restarting a worker can retry an interrupted audit once; retries may incur provider costs again. Stage checkpoints are not yet resumable.
6. Configure TypeSafe on the worker if desired. Its existing six-page/20-second pilot limits still apply. `TYPESAFE_AUDIT_MODE=shadow` enables it explicitly; production defaults to off. Agent jobs skip Gemini narrative. HTML-only crawling supports up to 100 pages per job (default 50), no competitors. Rendering, signed webhooks and external AI visibility tests are not yet implemented.
7. Run `AUDIT_API_URL=https://<preview> AUDIT_API_KEY=<secret> npm run agent:smoke` with secrets injected by your environment, not saved in shell history. Vercel Preview protection must be handled using the host's authorized access mechanism; don't disable it for testing. The smoke script exercises create, replay, poll and result retrieval.

## Job and result behavior

Create with `POST /api/v1/audits`, bearer authorization, JSON body and an `Idempotency-Key` of 8–128 allowed characters. A new job returns 202 immediately. Replaying the same normalized payload and tenant/key returns its existing job (200); a different payload returns 409. Idempotency currently lasts for the lifetime of the row; don't delete rows without considering replays. Two outstanding jobs and 20 created jobs per tenant/day are enforced transactionally. A cancelled job still counts against the daily quota.

Poll `GET /api/v1/audits/{id}` every five seconds with backoff on 429/503. Get results at `/result` only once status is `completed` or `partial`. `completed` means the configured HTML crawl completed; it does not mean whole-site coverage or absence of limitations. `partial` denotes a crawl error or budget stop. A no-page crawl fails with no scores. `POST /cancel` is idempotent and leaves terminal jobs unchanged; active work stops on the next heartbeat (normally within 20 seconds, plus bounded storage latency). Cancelled jobs cannot publish results. A stale worker's lease cannot overwrite a newer claim.

All responses use `Cache-Control: no-store`. IDs alone grant no access; reads/cancels are filtered by authenticated tenant. Cross-tenant requests return 404. Clients should retain the job ID and retry read requests, not start a new audit after a timeout. API errors are machine codes without provider responses or secrets. Treat a failed/partial job differently from a completed report with no defects.

## Evidence and outreach

Each check has `pass`, `fail`, `unknown`, `not_applicable` or `needs_review`, affected URLs, timestamp, evidence references and a verification step. HTML absence claims are page-scoped and suppressed for truncated/sparse evidence. Indexing exclusions require intent review; they are not automatically called defects. JSON-LD checks currently cover syntax and type-only stubs, not comprehensive schema.org or Google eligibility validation. Form checks cover a subset of accessible-name rules, not WCAG compliance.

`fetchedPageBasics` is a transparent provisional title/description/index-permission checklist. Unknown checks reduce coverage; any indexing-intent review or coverage below 80% withholds the score. The overall, answer-usefulness, entity-clarity and AI-visibility scores remain null until their methodology is validated. Legacy dashboard grades are not included in agent results.

Every finding defaults to `outreachEligible:false`. After held-out review, an administrator may register an exact check/methodology/profile/benchmark ID in `AGENT_VALIDATED_CHECKS_JSON`. Never populate this just to make a demo pass. Eligibility is recalculated on result retrieval: evidence older than 24 hours, incomplete evidence, unsupported wording and non-fail statuses cannot qualify. Request a new audit with a new idempotency key when evidence expires. Only use `allowedWording` when `outreachEligible` is true; the presence of wording by itself does not authorize a claim. Do not use semantic confidence as permission or a correctness percentage.

Saved result data includes public page observations. Set a retention policy appropriate to your customers before live use. No webhook destinations, sending integrations, new production credentials, or public database grants are created by installing this code.

## Validation

`npm test` covers API auth/scopes, requests, worker lifecycle and extraction regressions. `tests/agent-jobs.sql` runs against an isolated PostgreSQL database after the migration and verifies idempotency, quota enforcement, lease recovery, stale-write fencing and database role restrictions. Never run fixture SQL against production. `npm run agent:smoke` is the deployed end-to-end smoke check. Neither tests nor smoke checks replace the held-out accuracy benchmark.

## Website scope

Set `websiteType` to `marketing`, `corporate`, `ecommerce`, or `auto`. Independently set `ecommerceFunctionality` to `yes`, `no`, or `auto` to support a marketing/corporate website with a store. Explicit `no` always excludes ecommerce scoring and findings. Auto detects same-host cart/checkout/basket links as review candidates; it does not activate ecommerce scoring. Store type or explicit yes enables it. Broad keywords and Product/Offer schema alone do not identify an ecommerce site. The resolved scope is returned in `siteType`. Existing saved reports retain their original results; rerun with the new scope to replace legacy classification.
