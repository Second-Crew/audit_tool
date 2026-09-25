# Audit Tool

GEO/AEO website audit tool for evidence-backed diagnostics.

## TypeSafe evidence verification

The normal report does not display a provider-branded content score. Preview
workspaces offer a collapsed Internal diagnostics section with a fixed
claim-support development evaluation and archived pilot output. TypeSafe is
being evaluated for verifying evidence-backed claims; synthetic results do not
certify real-world accuracy or authorize outreach. The old generic scoring pilot
is off by default. See [claim verification](docs/claim-verification.md).

## Backend v2

- Crawls up to 250 pages per submitted site.
- Reads sitemap, robots.txt, and llms.txt.
- Checks ChatGPT/OpenAI, Google, Perplexity, and Claude crawler access signals.
- Scores sampled technical SEO, page experience, security, and accessibility when evidence is sufficient; reports structured data, answer content, entity, and vertical checks as ungraded observations. Overall and GEO/AEO outcome grades remain withheld until query-level calibration. See [calibration methodology](docs/calibration-methodology.md).
- Accepts manual competitor URLs for API-light comparison.
- Uses Gemini for optional evidence-grounded summaries and roadmaps.
- Saves clients and audit history to Supabase when configured.

## Gemini Narrative Layer

Gemini is optional. Generated prose is disabled by default because its claims have not passed evidence validation. Client reports use deterministic summaries unless an operator explicitly enables a reviewed pilot. The crawler/scoring engine remains the source of truth.

Set these env vars to enable it:

```
GEMINI_API_KEY=your_key
GEMINI_MODEL=gemini-2.5-flash
AUDIT_LLM_PROVIDER=gemini
AUDIT_GENERATED_NARRATIVE_ENABLED=true
```

Leave `AUDIT_GENERATED_NARRATIVE_ENABLED=false` for normal client reports. If Gemini is not configured or times out, the app uses deterministic report text.

## Supabase

1. Create a Supabase project.
2. Run `supabase/schema.sql` in the SQL editor.
3. Copy `.env.example` to `.env.local`.
4. Set `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`.

The app still runs without Supabase env vars; persistence is skipped in local/dev mode.


## Agent workflow integration (Preview)

The versioned agent API and persistent worker are documented in [docs/agent-api.md](docs/agent-api.md), with an [OpenAPI contract](docs/agent-openapi.json). Apply the separate SQL migration and configure the worker before enabling the API. Authentication uses scoped machine credentials; dashboard cookies do not grant access. Evidence assessments distinguish unknown from failed checks and default to no automatic outreach until benchmark approval. This build does not claim calibrated GEO/AEO accuracy or observed AI-search visibility.

### JavaScript-rendered pages

The audit makes a bounded browser-rendering pass when fetched HTML contains scripts but little extractable main text. Configure a local Chrome executable (`RENDER_CHROME_EXECUTABLE_PATH`) on a worker or a trusted Playwright-native remote browser (`RENDER_BROWSER_WS_ENDPOINT`) as a server-only environment variable. Without a configured renderer, or when article content is still unavailable, the report shows incomplete evidence and withholds content-based and overall grades. See [rendered evidence](docs/rendered-evidence.md).
