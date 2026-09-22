# TypeSafe claim verification: development validation

The provider-branded content-score panel has been removed from the normal report. Saved pilot results remain inside the collapsed **Internal diagnostics → Archived content-scoring pilot** section and are excluded from print and prospect HTML/Markdown. New audits no longer run the generic content-scoring pilot automatically; `TYPESAFE_AUDIT_MODE=shadow` explicitly opts into that archived diagnostic experiment.

## New use case

`verifyClaim` in `lib/audit/claim-verification.js` checks whether one cited page excerpt supports one claim:

1. Reject invalid, oversized or truncated evidence without inference.
2. Normalize whitespace and check that the supplied quote actually occurs in the source. A missing quote is rejected by code.
3. Ask TypeSafe Choice whether the full claim is supported, contradicted or insufficiently evidenced by the quote's context. Preserve scope, qualifications and attribution. Textual support is not external fact verification.
4. Validate response structure and probability distribution. Low-confidence judgments require review; provider errors remain unavailable. Never authorize outreach merely because the model says supported.

The fixed development threshold is 0.8 and the pinned model is jev-1.13.0. Both are recorded in evaluation output. There is no change to audit grades or automatic outreach policy. `wouldAccept` exists only to measure the provisional decision rule; `outreachEligible` always remains false.

## Run the development evaluation

In an authenticated **Preview** workspace, open Internal diagnostics and select **Run development evaluation**. The endpoint only accepts the bundled synthetic cases; it does not fetch arbitrary supplied URLs or accept user-supplied claims. It requires the workspace cookie, same-origin request, Preview environment and configured TypeSafe key. Production requests are rejected. It runs at most 20 provider calls, four at a time, under a 60-second total deadline, with no SDK retries. Warm instances cache results for an hour; this is not a cross-instance billing quota.

The set contains 24 implementation-authored examples across local services, ecommerce, SaaS and informational content: supported, contradicted, unsupported outcome claims, unsupported whole-site extrapolation, fabricated quotations and prompt injection. All sites/text are fictitious. Labels are synthetic development expectations, not independent human annotations. The source and expected labels are frozen in `lib/evaluation/claim-cases.js` and are never sent as labels to the provider.

Outputs include accepted-claim precision, supported-claim recall, false accepts, unavailable/review counts, per-profile summaries, token use, elapsed time and a Wilson 95% precision interval. A quote-matching-only baseline makes it possible to see whether semantic checks add discrimination beyond exact matching. Code catches fabricated quotes for both approaches; that benefit must not be credited to TypeSafe. If no claims are accepted, precision is null, not 100%. A high precision value based on very few accepted claims is not approval.

## Standard still required for real use

- Freeze independently reviewed evidence from representative real websites across the supported business/page types, with both valid findings and convincing false positives.
- Have reviewers label claim support and scope, resolve disagreements, and split sites into tuning and held-out validation sets.
- Compare the same candidates with and without semantic verification; report precision and recall by profile, sample counts, unavailable/abstention rates, cost and confidence intervals. A second semantic model is not independent ground truth.
- Use the planned 98% observed precision target only with adequate held-out samples and uncertainty disclosure. Any critical unsupported claim blocks automatic use; insufficiently validated profiles stay manual-only.
- Only then register a validated check/profile/methodology in the agent's outreach policy. Do not automatically publish benchmark approval from a synthetic run.

This implementation makes the proposed value testable. It does not claim improved real-world scoring accuracy until that independent benchmark exists.

Primary references: [TypeSafe citation verification](https://docs.typesafe.ai/cookbooks/citation_check), [Choice](https://docs.typesafe.ai/primitives/choice), [Confidence](https://docs.typesafe.ai/confidence).
