# AI Technical Readiness checklist — implementation plan

Status: implemented locally; Preview verification pending. The owner selected the checklist approach on October 5, 2026, replacing the predictive-model direction, and requested explicit FAQ, chatbot, structured-data and llms.txt assessment. No predictive model or citation study is required. New audits use `ai-technical-checklist-v1`; historical reports retain their original measurements.

## Product scope

Display **AI Technical Readiness** with the subtitle **Sampled technical checks**. Give the report a numeric technical-check score plus a visible supporting-feature checklist with evidence, findings and fixes. The feature assessment includes FAQs, structured data, llms.txt and chatbots; these must not disappear merely because they are not universal crawler prerequisites.

The number measures published checks on the audited sample, not the probability of a citation or recommendation. Observed GEO/AEO continues to measure the independently reviewed citation panel. Keep the overall cross-channel grade withheld.

## Core scored checks

For each sampled public page, assess:

1. Successful HTML retrieval, with redirects and status recorded.
2. Googlebot robots permission for the sampled path.
3. OAI-SearchBot robots permission for the sampled path.
4. Applicable indexing directives do not prohibit indexing.
5. Applicable snippet directives do not prohibit a text snippet; preserve partial exclusions separately.
6. Usable main text can be extracted, recording fetched versus browser-rendered evidence.

Do not describe robots permission as confirmed provider retrieval, absence of noindex as confirmed indexing, or a successful browser render as proof that every AI crawler can render the page. Provider-specific access checks can be added when their documented crawler roles and rules are implemented and tested; do not treat a training crawler as a search crawler.

Publish exact check rules and extraction thresholds in the implementation. Include known failed requested pages in sample coverage rather than silently dropping them. Treat transport errors and unavailable evidence as unknown where they cannot establish a site's failure.

## Supporting features included in every report

| Feature | Automated checks | Human review or evidence limits | Report treatment |
| --- | --- | --- | --- |
| FAQs and answer content | Detect real question-and-answer pairs; require visible, nonempty answers; distinguish a dedicated FAQ section from ordinary marketing questions; inspect extraction and applicable snippet restrictions. | Review relevance to actual customer questions, factual correctness, completeness, and consistency with products/services/policies. A keyword or heading alone cannot establish answer quality. | Show answer evidence, inaccessible/empty answers and relevant content opportunities. A dedicated FAQ page is optional; useful answers can live on service or product pages. |
| Structured data / schema | Detect JSON-LD, Microdata and RDFa where supported; report unsupported detection explicitly. Parse validity, identify applicable types and required fields for the chosen documented validation target, and check entity URLs and visible-field consistency where feasible. | Distinguish parseable JSON, Schema.org vocabulary checks, feature-specific validation and factual accuracy. Verify identity, service/product details and correspondence to visible content. | Show valid findings, errors, contradictions and applicable opportunities with page evidence. Do not call a syntax-only result fully validated or award a pass merely for having a script block. |
| llms.txt | Check the file's response, readable Markdown, company summary, scope and links to relevant public information; inspect sampled link availability and whether key business facts agree with reviewed site evidence. Note meaningful agent-friendly linked content. | Presence demonstrates a published guide. Actual consumption by a particular provider requires separate evidence. A changing proposal version must be recorded; a simple legacy file is not automatically invalid. | Include a dedicated result: present and checked, needs improvement, not observed, or could not verify. Recommend useful content and link fixes where appropriate. It does not grant crawler permission or override robots directives. |
| Chatbot / assistant | Detect a visible widget or public integration, identify a provider only when supported by evidence, and assess observable access, labeling and visible fallback/contact controls. | A widget does not prove AI functionality or correct answers. Business-answer accuracy, source grounding and escalation require an explicitly scoped interaction test or human review. Do not send messages or lead forms merely to detect the feature. | Report availability and review needs. No chatbot is an optional feature choice, not an automatic readiness failure. |

All four features receive findings and recommendations when evidence supports them. They remain visible beside the score. Their simple presence or absence contributes no automatic points. In v1, their quality assessment is a separate descriptive checklist: this keeps optional feature choices from changing the core score denominator or hiding a crawl-access blocker. Any later numeric feature-quality rubric must be separately named, versioned and published as a checklist, not a citation predictor.

Use explicit statuses: **Passed**, **Needs improvement**, **Not observed**, **Not applicable**, **Could not verify**, and **Needs human review**. Keep feature presence separate from quality status. A feature can be detected while its quality is unverified. Include page/file URL, observation time, evidence source, observed facts, rationale and recommended action. Do not claim that FAQs, schema or llms.txt guarantee AEO/GEO improvements.

## Formula and incomplete audits

`score = round(100 × passed core checks / assessed applicable core checks)`

Show passed, failed and unknown counts plus `coverage = assessed applicable checks / all applicable checks`. A fully measured zero is valid. Unknowns are neither passes nor failures.

Incomplete coverage receives a **Provisional** label and the score's possible range if all currently unknown checks fail versus pass. With P passed, A assessed and U unknown, that range is `100 × P/(A+U)` through `100 × (P+U)/(A+U)`. This range describes missing checklist evidence, not statistical confidence or future citations. If nothing is assessed, show **Could not assess** and a reason. Display critical engine-access blockers next to the total even if many other checks pass. Do not silently apply an arbitrary readiness grade such as “AI-ready” or “excellent.”

## Implementation sequence

1. Define the versioned core check contract, denominator, public-page sample and provenance. Add missing snippet-directive extraction and regression coverage.
2. Extend supporting-feature extraction and evidence records. Preserve unknown states; ensure FAQ detection does not regress the previous product-page and empty-FAQ fixes. Review existing schema and llms.txt extraction before adding duplicate fetches.
3. Implement a pure descriptive scorer with counts, coverage, possible range and blockers. Replace the old “scale unvalidated” caption with the accurate checklist definition for new-methodology reports.
4. Add core-check and supporting-feature sections to the dashboard, HTML and Markdown. Make all four requested features visible, with actionable evidence and status rather than a bare presence badge.
5. Persist the methodology version, scores, feature evidence, counts and review status. Preserve them when reopening or rebuilding a missing export. Leave historical reports faithful to their original measurements and mark the older scoring method clearly.
6. Run focused tests for full/partial/zero/empty evidence, directives, crawler blocks, fetched/rendered distinctions, real versus false FAQ detection, invalid/mismatched schema, missing/broken llms.txt and unverified chatbots. Verify store and agency applicability without imposing a FAQ or chatbot requirement.
7. Run a real Second Crew Preview audit and verify save → history → reopen → HTML/Markdown consistency. Record observed results and update draft PR #1. Production activation retains its existing separate approval and release gates.

## Source basis and wording

The [llms.txt proposal](https://llmstxt.org/) describes a concise, agent-friendly guide with links into a site's information. This is a useful feature to inspect. Publishing it does not alone demonstrate use by ChatGPT, Claude or any other named service.

[Google's AI-feature guidance](https://developers.google.com/search/docs/appearance/ai-features) supports accessible textual content and structured data matching visible content; it says no special AI text file or special schema is required for those Google features. [OpenAI's crawler guidance](https://developers.openai.com/api/docs/bots) identifies OAI-SearchBot and robots/IP controls for ChatGPT Search access. These distinctions should appear in the report's explanations without dismissing the owner's request to assess helpful content and agent-friendly resources.

## Published v1 rules

- Each successful HTML page, failed requested URL and audit-bot-skipped path contributes six equal-weight applicable checks. Duplicate successful redirect destinations keep their recorded request provenance. Discovered but unrequested URLs are outside this sample; crawl limits do not establish site-wide coverage.
- Successful initial HTTP 2xx HTML retrieval passes retrieval. A recorded non-HTML/offsite redirect or unsuccessful HTTP response fails that audit retrieval check only; it does not establish provider access. Transport errors and audit-bot-skipped requests are unknown.
- Googlebot and OAI-SearchBot permissions use the existing robots parser on requested and final paths. A deny on either fails; unavailable/truncated robots evidence is unknown. 404/410 robots responses impose no rules in this implementation. Other unsuccessful robots responses are conservatively unknown.
- Indexing and snippet controls use Google-documented generic/Googlebot meta and X-Robots-Tag semantics. `noindex`, `none` and an elapsed parseable `unavailable_after` prohibit indexing. `nosnippet` and `max-snippet:0` prohibit text snippets. Positive `max-snippet` limits and partial `data-nosnippet` exclusions remain recorded. All extracted main text excluded by supported data-nosnippet elements fails snippet reuse. `none` means noindex/nofollow, not nosnippet. Conflicting restrictions combine conservatively across fetched and rendered evidence. This does not claim every provider interprets these rules identically.
- Usable main text means at least 80 characters after boilerplate/explicitly hidden elements are removed. Sparse script shells or unavailable rendering remain unknown; a complete sparse static page fails this extraction threshold. Truncated HTML cannot establish directive permission or usable text. Rendered and fetched main-text provenance are retained.
- FAQ answer extraction supports question headings, definition terms and details/summary with an adjacent accessible answer of at least 40 characters/seven words. Dedicated FAQ purpose is separately detected; ordinary marketing questions do not become FAQ pages. Human relevance/accuracy review is explicit.
- Schema validation is limited to JSON-LD parsing and a declared entity subset: name/headline on Organization, LocalBusiness, ProfessionalService, Product, Service, Article and BlogPosting, an absolute HTTP(S) entity URL when provided, and extracted visible-name consistency. Microdata/RDFa types are detected but not validated. Applicable types, feature-specific required fields and factual accuracy require human review; syntax alone receives no full-validation claim.
- llms.txt checks a readable Markdown title/sections, a summary of at least 40 characters/seven words, company-name consistency and same-site references. Up to twenty guide links are compared with the existing crawl, without duplicate requests. Unrequested links remain unverified. The proposal inspected on October 6 is v2; basic checks accept legacy Markdown guides. Company facts require human review.
- Chatbot provider identification uses known integration resource hosts, never keyword-only vendor claims. Static accessible labels/keyboard controls and public contact fallback are recorded. Widget interaction, focus behavior, AI capability, grounding and answer accuracy remain human-review needs. No messages or forms are sent.
- Checklist score, methodology, counts, coverage, missing-evidence range, per-page records, blockers and all supporting assessments persist in `report.ai_technical_readiness` and the workspace summary. History includes version/status/coverage. Missing exports reconstruct from saved measurements without rescoring; old reports remain unchanged.

Directive basis: [Google robots meta, X-Robots-Tag and data-nosnippet documentation](https://developers.google.com/search/docs/crawling-indexing/robots-meta-tag), inspected October 6, 2026. Crawler roles: [OpenAI crawler documentation](https://developers.openai.com/api/docs/bots). Guide scope: [llms.txt proposal](https://llmstxt.org/).

## Local verification and first Preview attempt — October 6

The complete updated suite passes 229 tests across 34 files. It includes directive transport (preserving repeated X-Robots-Tag header boundaries), full/partial/zero/empty checklist evidence, redirects, snippet controls, fetched/rendered provenance, optional features, historical N/A and save/reopen/fallback export parity. The first real Second Crew Preview attempt on `40f7360` retrieved 56 pages, then its stream ended without a result during rendering. It did not produce a verified saved report.

The dashboard now gives rendering an absolute request deadline at 240 seconds, reserving the final minute of the 300-second function for extraction, exports and bounded persistence. PageSpeed keeps its verified 120-second first attempt and 150-second total budget. Remaining unrendered script shells stay unknown and Provisional instead of preventing a checklist report. This fixes a budget conflict where PageSpeed (up to 150 seconds) followed by rendering (up to 180 seconds) could exceed the host limit. The browser renderer rechecks the remaining navigation budget after connecting; skipped/failed content is not scored as absent.

The extension refused the prepared panel upload due its file-URL permission check. Native Chrome control yielded to foreground changes. No browser settings were changed or controls bypassed. The new technical-only acceptance run has no uploaded citation panel, so its GEO/AEO must remain unassessed; earlier Second Crew observed reports retain 3/100. The combined observed-panel/checklist storage and export path is verified locally with mock storage, not represented as a new hosted panel upload.

The second attempt on `b4f3751` lost its browser session across a Chrome restart and fresh history contained no new saved report. Its request logs showed repeated renderer **429 Too Many Requests** responses. Rendering now abstains after a provider rate limit, bounds even an unsettled renderer promise by the request deadline, and gives provider cleanup at most two seconds. Late renderer results cannot mutate scored page evidence. Connection logs contain only controlled reason codes. A missing rendered entity name is an unverified consistency check, not an automatic schema defect. These paths are covered by the final 229-test suite; a new hosted acceptance run is pending.
