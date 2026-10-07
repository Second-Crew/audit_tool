const REASONS = {
  request_timeout: 'Google PageSpeed did not finish within the request deadline.',
  rate_limited: 'Google PageSpeed rate-limited the measurement.',
  access_denied: 'Google PageSpeed rejected API access.',
  lighthouse_error: 'Google Lighthouse could not complete the measurement.',
  no_performance_score: 'Google PageSpeed returned no usable performance score.',
  api_error: 'Google PageSpeed returned an API error.',
  request_failed: 'The Google PageSpeed request could not be completed.',
};

// Only controlled reason codes reach workspace/export copy. Provider messages,
// response bodies and URLs (which may contain API keys) are never displayed.
export function pageSpeedStatusText(measurement, score) {
  if (score != null) return 'Measured by Google PageSpeed Insights on the requested URL.';
  return Object.hasOwn(REASONS, measurement?.reason) ? REASONS[measurement.reason]
    : 'No usable Google PageSpeed measurement was saved for this run.';
}
