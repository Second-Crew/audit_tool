# Agent foundation validation — September 22, 2026

- Unit/integration suite: 86 passing tests, including evidence provenance and conservative comparative-score behavior.
- Next.js optimized production build passed, including all four v1 agent routes.
- Temporary PostgreSQL migration applied and reapplied successfully. SQL regression tests passed: tenant-scoped idempotency, conflicting payloads, quotas, distinct claims, lease recovery, stale-worker write fencing, retry ceiling and role restrictions.
- Concurrent database exercise: eight simultaneous identical enqueue calls created one job; eight simultaneous claims returned exactly two distinct leases.
- Local end-to-end test used the real optimized Next.js API, a persistent worker child process, real PostgreSQL via a test-only local REST adapter, and a live example.com crawl. Create returned 202, replay returned the same job, polling reached completed and results returned six evidence-linked checks. No production database or real machine credentials were used.
- The sample returned a provisional fetched-page-basics score of 83/100 at full check coverage. Overall, semantic readiness and observed AI visibility remained null. Zero checks were outreach-eligible. This result is evidence of workflow execution, not scoring accuracy.
- The previously deployed TypeSafe pilot separately completed a real TypeSafe request and preserved uncertain judgments on reopening. The new local agent smoke used TypeSafe off; it does not establish a new provider calibration result.

Still required before activation: apply the migration to the selected Preview database, configure scoped credentials, deploy a persistent worker, verify the actual hosted API/storage/worker path, and run a held-out reviewer-labeled benchmark before approving automatic outreach checks. Rendered crawling, full schema validation, webhooks, resumable stage checkpoints and broader calibrated category scores are not implemented in this foundation release.
