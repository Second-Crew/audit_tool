export const LEGACY_SCORE_NOTICE = 'Archived score: this report uses an earlier, uncalibrated scoring method. Its overall, GEO/AEO, and AI-readiness grades are not measured search or AI visibility. Rerun the audit before sharing or using those grades.';

export function hasLegacyOutcomeScores(scores) {
  return scores?.methodologyVersion !== 'evidence-v1'
    && [scores?.overall, scores?.aeoGeo, scores?.aiReadiness].some((value) => typeof value === 'number');
}

export function labelLegacyHtml(html, scores) {
  if (!hasLegacyOutcomeScores(scores) || !html) return html;
  const notice = `<div role="note" style="background:#fff7ed;border:2px solid #f59e0b;color:#78350f;font:600 15px/1.5 Arial,sans-serif;padding:16px;margin:16px auto;max-width:1100px">${LEGACY_SCORE_NOTICE}</div>`;
  return /<body[^>]*>/i.test(html)
    ? html.replace(/<body[^>]*>/i, (body) => `${body}${notice}`)
    : `${notice}${html}`;
}

export function labelLegacyMarkdown(markdown, scores) {
  return hasLegacyOutcomeScores(scores) && markdown
    ? `> **${LEGACY_SCORE_NOTICE}**\n\n${markdown}`
    : markdown;
}
