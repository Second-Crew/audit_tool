# Prospect GEO/AEO observed-visibility panel

The dashboard can show a 0–100 **observed GEO/AEO visibility** number only when an operator supplies a reviewed, site-specific panel for both ChatGPT Search and Google AI Mode. It is an equal-weight own-domain citation rate on the stated prompts, market, dates, and engine settings. It is not a prediction, an AI-readiness grade, or proof that a website change caused the result. A crawl with no qualifying panel still shows N/A.

## Collection and review

1. Before any answers are viewed, define 10 unbranded questions that real buyers in the prospect's market would ask. Record the target domain, brand, market, language, panel version, and `frozenAt` timestamp. The questions must not name the brand or target domain. Have a reviewer check relevance and intent balance before collection.
2. For each exact question, collect three independent ChatGPT Search answers and three independent Google AI Mode answers, on at least two dates. Use one consistent model, location, and personalization setting per engine. Personalization and cross-chat memory must be off or otherwise verifiably isolated. Start a fresh thread per run. Keep Google AI Overviews separate: Google says they only appear when its systems find them useful, while AI Mode is a distinct experience and can show different links. [Google AI feature guidance](https://developers.google.com/search/docs/appearance/ai-features), [AI Mode help](https://support.google.com/websearch/answer/16011537?hl=en)
3. For every run, record the exact prompt, timestamp, answer presence, brand mention, all cited URLs, model/context, and a unique share link or durable evidence URL. Open each cited destination. Exclude errors, memory-contaminated runs, unverifiable citations, and ambiguous answers as invalid with a reason. Never convert an invalid run into a citation miss.
4. Review the 60 valid runs and mark `validationStatus: "validated"`, `isolationVerified: true`, and `citationsVerified: true` only after the evidence is checked. An operator attestation is not automated verification; spot-check the evidence links before sharing a report. Keep the raw panel in the private saved audit record; the prospect report shows aggregates and query-level counts.
5. Upload the reviewed JSON file in the diagnostic form. The server rejects a mismatched site, altered prompt, duplicate run/evidence link, changed engine context, fewer or more than 30 valid runs per engine, a single-date batch, observations older than 30 days, or incomplete verification. The site crawl does not start after a rejected upload.

The report shows each engine's citation, answer-presence, and brand-mention rates separately. The combined 0–100 number is the arithmetic mean of the two own-domain citation rates, with every query weighted equally within each engine. A citation is an actual link to the audited domain or its subdomain; a name in an answer, map card, ordinary organic result, or allowed crawler in `robots.txt` is not a citation. A valid 0/100 means no own-domain citations in these 60 runs. N/A means the required observations are absent or invalid.

Google Search Console's [generative AI performance report](https://support.google.com/webmasters/answer/16984139?hl=en) measures a verified owner's link impressions in AI Overviews and AI Mode. It does not provide this panel's exact prompts and answer links, and a prospect's private data must not be assumed available. Use it as separate first-party context only with that site's access.

## JSON shape

The file is an object with these fields; repeat the query and observation objects until all 10 questions and 60 valid runs are present. Set `valid: false` and `invalidReason` on excluded attempts. The sample URLs and company below are placeholders, not evidence.

```json
{
  "version": "example-market-v1",
  "frozenAt": "2026-09-24T12:00:00Z",
  "targetDomain": "example.com",
  "brand": "Example Company",
  "market": "San Francisco Bay Area, California",
  "language": "en-US",
  "queries": [
    { "id": "q1", "prompt": "Which local agencies can redesign a growing online store?" }
  ],
  "observations": [
    {
      "engine": "chatgpt-search",
      "queryId": "q1",
      "prompt": "Which local agencies can redesign a growing online store?",
      "runId": "q1-chatgpt-1",
      "observedAt": "2026-09-25T18:00:00Z",
      "model": "record the actual model",
      "locationContext": "California desktop, en-US",
      "personalizationState": "off",
      "searchEnabled": true,
      "valid": true,
      "validationStatus": "validated",
      "isolationVerified": true,
      "citationsVerified": true,
      "answerShown": true,
      "brandMentioned": false,
      "permalink": "https://chatgpt.com/c/example-evidence-link",
      "citedUrls": ["https://other-agency.example/services"]
    }
  ]
}
```

For Google AI Mode rows use `engine: "google-ai-mode"`, the same frozen `queryId` and exact prompt, and a unique Google AI Mode evidence link. Share links may expose conversation content; check them before using them in an audit. The public report contains counts and prompts, not those links.

## Launch gate

Do not advertise this as a general AI-search ranking or guaranteed SEO uplift. Before the first prospect report is shared, verify a real two-engine panel against original answer screens, run the complete dashboard → saved report → HTML/Markdown export flow in Preview, and confirm the production workspace access, shared rate limiting, rendering, storage/retention, and deployment smoke checks. The agent API and automatic outreach have separate activation requirements in [agent API](./agent-api.md).
