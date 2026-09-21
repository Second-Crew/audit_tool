# TypeSafe content scoring pilot

Add `TYPESAFE_API_KEY` to the project's Vercel **Preview** environment. Install with `npm ci` and deploy this branch to Preview. Node.js 20+ is required by the official SDK. No database migration is required: the assessment is saved in the existing report workspace JSON and survives reopening an audit.

The pilot runs automatically when a key is present on Preview or local development. Production defaults to off, even if a key is present. `TYPESAFE_AUDIT_MODE=off` disables it; `shadow` explicitly enables the pilot. It does not enable a production scoring replacement.

## What it measures

TypeSafe classifies page purpose and judges three separate dimensions of cleaned HTML excerpts: topic clarity (40%), useful detail (40%), and supporting evidence (20%). Four concrete rubric levels map to 0–100. Code combines the dimensions and equally weights sampled pages. Requested model is pinned to `jev-1.13.0`; each response records the resolved model. Rubric version is `content-pilot-1`.

The internal Overview panel shows the scores, raw confidence, source excerpts, URLs, coverage, and token counts. JSON uses `audit.semantic`; saved history uses `report.workspace.semantic`. Old reports remain compatible. The pilot deliberately does not alter GEO/AEO/SEO grades, feed Gemini, create action-plan tasks, enter HTML/Markdown/printed prospect reports, or authorize outreach. `outreachEligible` is always false. It does not measure AI search inclusion or independently verify claims made by a site.

## Bounds and failure behavior

- At most six distinct usable URLs in crawl order, two concurrent requests, 10,000 excerpt characters per page, eight seconds per request, and a 20-second total abort signal. SDK retries are disabled to bound costs/latency; rerun an audit after a transient failure.
- Raw HTML, scripts, styles, templates, navigation, headers, footers, explicit hidden elements, and inline hidden elements are excluded from model text. CSS-driven visibility and JavaScript rendering are not evaluated. Sources are explicitly labeled HTML excerpts, not fully rendered visible content.
- Text under 80 characters is unassessed. Truncation is recorded. Pages outside the sample remain unassessed, not failed.
- Missing credentials, service errors, malformed answers, and insufficient evidence are explicit skipped/unavailable states. Provider errors are sanitized; keys are never sent to the browser or included in logs.
- A dimension confidence below 0.8 withholds its page composite; any unscored sampled page withholds the overall sample composite. This provisional threshold is for human review, **not** a calibrated 80% correctness guarantee. Raw judgments remain available for evaluation.
- A primary crawl with no successful pages now fails before score generation, rather than generating misleading website grades.

## Before using these judgments in sales or client work

Build a held-out, manually labeled set spanning local services, SaaS, ecommerce, educational content, small sites, JavaScript shells, sparse content, misleading claims, and non-English pages. Compare page labels and rubric judgments with reviewer decisions; inspect false positives and unknown rates. Measure actual latency and token cost. Validate on examples not used to tune questions or thresholds.

Only after this evaluation should a separate change introduce calibrated weights into published scores or a claim-verification gate for outreach. The older deterministic engine still has other review findings; this pilot does not silently certify or repair those scores.

References: [JavaScript SDK](https://docs.typesafe.ai/sdk/javascript), [Score](https://docs.typesafe.ai/primitives/score), [Confidence](https://docs.typesafe.ai/confidence), [Models](https://docs.typesafe.ai/models).
