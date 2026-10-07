# SambaNova Preview verification — October 7, 2026

The owner selected https://sambanova.ai/ as the next report target. No Second Crew citation observations were reused. No messages, lead forms or chatbot interactions were sent to SambaNova.

## Final audit and exports

Final application revision `c4a830ac88002c25fe95289953c2300795575c73`, READY deployment `dpl_36o5fcqxjoQSnza1dugLM49jM86J`, was independently verified and the branch alias assigned to it. Report `4cbaeb50-699c-4e4a-bc21-88a7ca55c39b`, timestamp `2026-10-07T20:17:52.541Z`, completed in **129 seconds** and saved successfully.

- 250 crawled pages, 776 sitemap URLs; 243 pages had usable extracted text and seven were sparse. This is a bounded sample, not whole-site coverage.
- The checklist retains 251 sampled/requested records, including a request that redirected to the documentation subdomain. **98/100 Provisional: 1,469 passed, 25 failed, 12 unknown**, assessed coverage 1,494/1,506 (99% displayed). The whole-number missing-evidence range is 98–98. Exact counts and unknowns remain visible despite rounding.
- 24 failures are observed `noindex` directives, primarily on news/case-study pages; one retrieval failure is an off-audited-host redirect to docs.sambanova.ai returning HTTP 200. These are defined checklist outcomes, not 25 proven site defects. Review whether exclusions/redirects are intentional before recommending changes.
- Technical SEO 74, mobile PageSpeed 30, desktop 62, security 70, accessibility 98. These numbers retain their published scope; PageSpeed is a fresh lab measurement of the requested URL.
- FAQs/answers, schema and llms.txt are observed with Needs human review. Chatbots remain Could not verify, not a false detection of FAQ buttons containing “Chat Completions.” Some pages remain incompletely extracted, so absence is not established. llms.txt returned HTTP 200; provider consumption and business-fact accuracy remain unverified.
- Overall and GEO/AEO remain unassessed because no SambaNova-specific observed answer/citation panel was supplied. Narrative/experimental judgments do not become citation predictions.

Save → fresh history → full workspace reopening → served HTML → actual downloaded HTML and Markdown passed. The served HTML's complete per-page table was inspected in the live DOM: all 1,506 status counts match both full downloads and reopened evidence. All four supporting headings/statuses and measurement limitations match. Full exports have no raw panel, private conversation links, injected fixture credentials or invalid null/zero-denominator fractions. A separate captured DOM prefix is explicitly marked truncated, not represented as a complete served export. Final source tests pass **243 tests across 35 files**, and the optimized build passes.

Evidence is outside Git in `audit-review/sambanova-2026-10-07/`, including native downloaded `SambaNova_Final_Report.html` and `.md`, live-DOM verification, screenshots and sanitized metadata. Historical/intermediate reports remain faithful; no stored report was retroactively rescored.

## Corrections exposed by the site

The first run on `e5329df` saved report `fe6e1c68-0906-4da1-9566-ccbf0b1ebddb` in 162 seconds. Its /thank-you confirmation path was incorrectly treated as a critical business-content page, withholding otherwise usable site assessment. Question-shaped CTAs also produced unsupported missing-answer issues. The first correction (`8adc23c`) saved `2483b7d4-2bcc-4261-abdf-fa0fec7da327` in 112 seconds. Its full supporting evidence exposed a second false positive: FAQ controls mentioning Chat Completions were treated as chat widgets; page-level partial snippet exclusions were treated as answer defects without overlap evidence.

Confirmation pages now remain in coverage without acting as critical content gates. Heading-only answer wrappers are supported; missing answers require explicit FAQ context. Extracted entity-name mismatches require human review unless concrete syntax/entity errors are established. Chat controls require explicit action labels rather than incidental words in FAQ buttons. Partial snippet exclusions receive an overlap-review note, not an automatic missing-answer defect. Meaningful regressions cover these cases; numeric core rules and thresholds are unchanged.

## Resumed release checks

After the Mac was unlocked, the isolated SQL editor retained evidence of an orphan lease from the guarded Preview process-exit fixture with audit count unchanged at seven. A fresh read showed both lease IDs `70608ce7-6e5b-4047-9e3d-2bc92909068c` and `52a2e79c-5a22-4442-ad14-ad17befcad63` still present but inactive, with natural expiry timestamps `2026-10-07T07:59:15.290289Z` and `2026-10-07T07:59:51.052466Z`. No synthetic backdating or manual release was used. The next actual SambaNova admission removed both expired leases and held one new lease; completing the reports restored zero active leases. This verifies orphan-lease expiry/cleanup and admission recovery after the scoped pre-persistence exit fixtures. It does not promise automatic resumption of a terminated audit or claim a captured platform fatal-exit log; the historical CLI lookup remains unavailable.

A reversible SELECT-denial fixture tested the new first SambaNova report through the normal workspace Open action. The app displayed “The saved audit could not be loaded. Try again later.” Request metadata confirms HTTP 500; no private database/provider text appeared. This was a new unblocked resource, not a retry of the previously blocked fixture path. SELECT was restored and verified true. A separate stored HTML outage request for that first SambaNova report reached Chrome ERR_BLOCKED_BY_CLIENT. Its metadata shows HTTP 500, but the response body remains unchecked. No retry/alternate transport or Markdown attempt for that blocked resource followed. The final report uses a distinct healthy saved ID and its HTML/downloads passed.

Production remains unchanged and held. Remaining gates include browser-blocked stored-export outage bodies, authenticated private invalid/missing IDs, same-deployment autoscaling/instance-routing evidence, retention decision/cleanup, Production renderer capacity and configuration, monitoring, reviewed migrations/settings, explicit activation and post-release smoke. No report/raw-panel deletion, merge, Production change or prospect contact occurred.
