# Isolated manual-dashboard Preview setup

This runbook configures only branch `codex/typesafe-audit-scoring`. The current shared database, Production variables/deployment, deletion, generated narrative, optional agent API and prospect contact remain held. Use the reviewed code from draft PR #1.

## Recorded execution — October 5, 2026

The owner created `secondcrew-audit-tool-preview`, project `jwpnszxyciknxcjkcjyt`, on the Free plan in East US (Ohio), `us-east-2`. Its empty database received the four reviewed SQL files below. Branch-only Vercel overrides now use this project and enable shared controls. Production project `siyfqskgnfhizeeshyuu` and its configuration/deployment remain unchanged; other branches may still inherit shared values.

Actual panel audit/save/history/reopen/HTML/downloaded Markdown, hosted RPC concurrency/rate/counting, actual busy and expired-lease admission, insertion failure with usable exports, unavailable admission, safe history read failure and client disconnect all passed. Failure definitions/grants were restored and disposable fixtures removed; the single successful Second Crew report is retained. Read the [release checklist](production-release.md) for exact evidence and incomplete hosted checks. A READY Preview is not approval for Production or retention deletion.

## Target and approval

Create a separate, empty project named `secondcrew-audit-tool-preview` in the Second Crew organization, preferably the same West US region as the existing project. Confirm the plan/charge before creation; do not upgrade or add paid compute without a spending approval. If the provider requires a new database password, the owner completes that credential step. Never copy existing report rows, contact records or raw observation panels into the new project.

Record the new project ID and URL in restricted operational evidence. They must differ from Production project `siyfqskgnfhizeeshyuu` / `https://siyfqskgnfhizeeshyuu.supabase.co`. Verify the SQL Editor target before every write. Do not apply this runbook to the shared project.

## Initialize the empty database

Apply these repository files in order, using the new project's SQL Editor:

1. `supabase/schema.sql` creates clients, audits and report_sends with RLS, server grants and tracking. The existing-install migrations alone do not create these base tables.
2. `supabase/workspace-access.sql` explicitly restricts workspace table grants.
3. `supabase/report-tracking.sql` installs/reapplies the reviewed atomic invoker RPC.
4. `supabase/dashboard-admission.sql` creates shared attempt/lease tables and server-only admission RPCs.
5. Run `supabase/workspace-storage-checks.sql` read-only. Save restricted results, without secret values or report-row content. Require RLS, no browser table grants/policies, server CRUD, restricted RPC execution, fixed search paths and expected signatures.

The local PostgreSQL checks already verify application/reapplication and role behavior. Do not run `scripts/verify-dashboard-storage.mjs` against hosted storage; it deliberately creates its own temporary local database. Do not apply `supabase/agent-jobs.sql` for this manual release.

## Configure and deploy only this branch Preview

Set branch-specific Preview overrides on the existing Vercel project `audit_tool`:

- `SUPABASE_URL`: new isolated project URL.
- `SUPABASE_SERVICE_ROLE_KEY`: new project's server-only service-role key, marked sensitive. Provision through the authorized secure settings flow; do not print or commit it, include it in a command argument, or grant it to client components. The existing helper expects the legacy service-role key rather than a browser publishable key.
- `DASHBOARD_SHARED_LIMITS_ENABLED=true`.

Retain the existing Preview workspace password and renderer. Keep generated narrative and optional agent API off. Do not edit shared Production/Preview variables to achieve the override; leave Production's definitions unchanged. Record names, scopes and project IDs rather than secret values.

Redeploy the verified branch to Preview. Verify READY state, exact commit and the branch alias independently. Confirm the deployed Preview targets the isolated database and that Production configuration still targets the original project. Reuse the already-passed scoring/export regression results unless application code changes.

## Hosted acceptance

Use only explicitly disposable internal fixtures in the isolated project, never a real prospect or a record copied from Production. Do not contact anyone.

- Require protected history, reopen and workspace exports to deny unauthenticated access; verify safe missing/invalid IDs.
- Run one valid Second Crew panel audit through the form; confirm panel-loaded state, 3/100, exact engine counts, withheld grades, save/history/reopening and both actual exports. Keep the raw panel private. The previously verified report remains in the original database; an empty new history is expected.
- Verify server-role admission from two independent requests/instances: two admitted leases, further admission busy, five attempts per address per ten minutes, Retry-After, release after success/error, client disconnect without early release, and terminated-instance expiry recovery. Record returned decisions and fixture IDs without raw addresses or keys.
- Use an approved isolated failure fixture to reject audit insertion. Confirm the report visibly says not saved, local exports work, and history does not claim success. Verify unavailable storage returns bounded safe errors on history, reopen and exports. Restore the fixture/configuration after the check.
- Verify unavailable admission fails closed, including missing/broken shared-control configuration; no per-instance fallback after activation. Restore the working Preview configuration and verify recovery.
- Confirm renderer recovery on script-heavy content and safe abstention when rendering cannot recover. Do not provoke failures in the shared project.
- If tracked hosting is included, create a disposable internal send fixture and verify its public HTML/private boundaries, exact concurrent counts, missing-link behavior and link invalidation after an explicitly approved fixture cleanup. Do not execute the RPC on a real send merely to test access.

Do not broaden deletion or retention scope as part of fixture cleanup. Record each actual result and remaining blocker in `docs/production-release.md`; prepared tests are not hosted evidence.

## Restore or stop

On a failed migration, halt activation and retain the error in restricted evidence. On a Preview failure, keep the isolated database and shared controls intact for diagnosis; avoid pointing Preview back to Production. Restore a known working Preview build/configuration when approved, without deleting saved rows. Production migration/settings/deployment require a separate explicit approval after the hosted checks and retention decision.
