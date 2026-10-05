# Predictive AI-citation readiness: validation plan

The owner selected a predictive citation score on October 5, 2026. This supersedes the proposed technical-checklist replacement. This document defines the work required; it does not certify a model or activate numeric predictions. The current application still withholds the AI Readiness number.

## What the number will mean

Proposed product label: **AI Readiness — predicted citation rate**.

The target is the expected percentage of valid responses citing the audited site's own domain on a frozen, relevant, unbranded query panel during the next 30 days. Estimate ChatGPT Search and Google AI Mode separately, then combine them with equal engine and query weights. For example, 20/100 would mean a predicted 20% citation rate within that scope; it would not mean a 20% chance of ever being recommended anywhere.

Show the panel, market, language, forecast window, supported site segment, model version and uncertainty with the result. The present GEO/AEO score remains the separately labeled observed citation rate. Neither metric establishes causal uplift from fixing a website check.

## Data gap confirmed

- Existing accepted outcome evidence covers one target domain, Second Crew, with 60 validated selected runs from September 27–29. Own-domain citations are 0/30 on ChatGPT Search and 2/30 on Google AI Mode. Four excluded attempts remain excluded.
- These are repeated answers for one site, not 60 independent websites. The current sample cannot establish performance on unseen prospect sites or segments.
- The latest saved feature snapshot is the October 5 audit. It postdates those outcomes and cannot be paired with them as a prospective forecast test. Earlier snapshots need their own timestamp, feature-version and sampling review; do not backdate or retrofit features.
- No assembled cross-site training, calibration and final held-out dataset or validated model artifact exists in this branch. There is no missing Google API setting that can supply this score.

## Build sequence

1. **Freeze a pilot scope and sampling plan.** Start with a narrow agency segment and geography compatible with the existing business use case. Ecommerce needs its own evidence before a model is claimed to work for stores. Select sites without looking at their future citation labels, include sites with low and high visibility, and document selection bias. The prior public candidate list is a starting point for recruitment, not a representative labeled sample.
2. **Capture features first.** Archive each site's audit version, timestamp, public page sample, extracted/rendered provenance, missingness and relevant features before the forecast window starts. Candidate predictors include crawl permissions, indexing/snippet restrictions, readable content, relevance to the frozen prompts and verifiable entity evidence. Treat these as hypotheses; do not assign hand-chosen predictive weights. Use comparable page-type sampling and retain crawl failures.
3. **Collect matched future outcomes.** For each site and collection wave, use a separately scoped, frozen 10-query panel, three valid runs per query on each of the two engines, across at least two dates. Record precise dates within the forecast window, exact surface/model/settings, citation destinations, and reviewer evidence. Sixty valid observations per site per wave is the current panel protocol, not a guarantee of statistical sufficiency. As a workload example, 50 sites would require 3,000 valid observations per wave, plus excluded attempts and review. Determine the larger study size from the pilot's citation prevalence and desired precision.
4. **Fit a small baseline model.** Begin with a regularized probability model. Fit preprocessing, feature selection and any probability calibration only within development data. Compare against the engine/segment base rate and, where a prior panel exists, the last observed citation rate. Additional features must improve future predictions rather than merely reproducing an already known outcome.
5. **Test on unseen sites and later dates.** Keep all pages and waves from an organization/domain family in one partition. Reserve genuinely new organizations and a later collection window for a locked final test. Avoid splitting repeated answers or syndicated site variants between training and test. Evaluate each engine and supported segment separately. Use clustered uncertainty estimates because repeated prompts, shared markets and repeated answers are dependent.
6. **Release only after evidence passes the frozen criteria.** Freeze acceptance tolerances after the exploratory pilot and before final test labels are inspected. Evaluate predictive loss against baselines, calibration curves, aggregate forecast error, uncertainty, segment performance and abstention coverage. Brier/log loss alone does not establish calibration. There is no automatic approval merely for having a certain number of rows, achieving high classification accuracy on mostly uncited answers, or passing application unit tests. If final testing fails, retain its result and collect a new untouched test cohort before a materially retuned candidate can be approved.
7. **Integrate and monitor the approved artifact.** Load a versioned, explicitly approved model only for its supported scope. Persist prediction, inputs/version references, uncertainty and status with each new audit; preserve them in reopening, HTML and Markdown. Historical reports retain their original results. Abstain with a reason for missing critical inputs, unsupported markets/site types, expired validation or provider/model drift. Revalidate after material drift before resuming predictions.

## Collection and evidence constraints

Use observations from the actual target products, or a provider whose collection surface and methodology have been verified. Do not silently label an API-generated answer as a ChatGPT Search or Google AI Mode observation. A brand mention, directory listing and own-domain citation are distinct labels. Invalid or blocked attempts are not negative labels; retain the reason and follow the predeclared replacement rule.

Use each prospect's own panel and records. Do not repurpose Second Crew's accepted observations as another domain's benchmark. Keep raw transcripts, conversation URLs and private client data in restricted evidence storage, outside prospect exports and public commits. Honor the existing instruction to keep the user's memory/personalization settings on. A collection method requiring different account settings needs a separately authorized isolated setup; this plan changes no account settings and buys no service.

The first operational decision is the pilot's supported market/site segment and a feasible source of independently reviewable multi-site outcomes. No precise budget, completion date or guaranteed model accuracy is established by this plan. A next-30-day forecast requires outcomes collected after the feature freeze; that elapsed time cannot be replaced with invented labels.

## Report behavior after validation

A successful audit in a supported scope can receive a prediction automatically from the approved model without collecting a new outcome panel for every report. A query/market context is still required because citation probability depends on the questions being asked. Observed GEO/AEO continues to require actual observations. A universal numeric score for every arbitrary domain cannot be promised from a model validated only on one segment.

Suggested display: `AI Readiness — predicted citation rate: [estimate]/100`, with engine values, an uncertainty interval, forecast dates, scope and model version. Before validation, display `Prediction model not yet validated` with the missing evidence; never substitute a technical checklist, LLM opinion, zero, or the observed 3/100 panel score.

## Verification before activation

Check temporal leakage, site-group separation, invalid observations, missing features, out-of-scope inputs, model provenance, prediction bounds and stable save/reopen/export behavior. Run an actual Preview audit with an approved model artifact, verify that its saved prediction is reproduced unchanged, and test abstention. The existing Production approval and operational release gates still apply.

## References

- [Current calibration methodology](./calibration-methodology.md)
- [Reviewed query-panel protocol](./query-panel-protocol.md)
- [Google AI features and website requirements](https://developers.google.com/search/docs/appearance/ai-features)
- [OpenAI crawler roles](https://developers.openai.com/api/docs/bots)
- [Probability calibration and its evaluation](https://scikit-learn.org/stable/modules/calibration.html)
- [Grouped and time-dependent validation](https://scikit-learn.org/stable/modules/cross_validation.html)
