# Audit Tool

GEO/AEO website audit tool for evidence-backed diagnostics.

## Backend v2

- Crawls up to 250 pages per submitted site.
- Reads sitemap, robots.txt, and llms.txt.
- Checks ChatGPT/OpenAI, Google, Perplexity, and Claude crawler access signals.
- Scores structured data, answer readiness, entity trust, technical SEO, page experience, security, accessibility, and vertical-specific readiness.
- Accepts manual competitor URLs for API-light comparison.
- Uses Gemini for optional evidence-grounded summaries and roadmaps.
- Saves clients and audit history to Supabase when configured.

## Gemini Narrative Layer

Gemini is optional. The crawler/scoring engine remains the source of truth, and Gemini only rewrites evidence into executive summaries, score explanations, quick wins, and roadmap steps.

Set these env vars to enable it:

```
GEMINI_API_KEY=your_key
GEMINI_MODEL=gemini-2.5-flash
AUDIT_LLM_PROVIDER=gemini
```

If Gemini is not configured or times out, the app falls back to deterministic report text.

## Supabase

1. Create a Supabase project.
2. Run `supabase/schema.sql` in the SQL editor.
3. Copy `.env.example` to `.env.local`.
4. Set `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`.

The app still runs without Supabase env vars; persistence is skipped in local/dev mode.
