export async function getPageSpeedBundle(url) {
  const [mobile, desktop] = await Promise.all([
    getPageSpeedData(url, 'mobile'),
    getPageSpeedData(url, 'desktop'),
  ]);

  return {
    mobile,
    desktop,
    scores: {
      mobile: extractCategoryScore(mobile, 'performance'),
      desktop: extractCategoryScore(desktop, 'performance'),
      accessibility: extractCategoryScore(mobile, 'accessibility'),
      seo: extractCategoryScore(mobile, 'seo'),
      bestPractices: extractCategoryScore(mobile, 'best-practices'),
    },
    metrics: extractPerformanceMetrics(mobile),
    diagnostics: { mobile: mobile.measurement, desktop: desktop.measurement },
    available: [mobile, desktop].some(data => extractCategoryScore(data, 'performance') != null),
  };
}

async function getPageSpeedData(url, strategy) {
  // PageSpeed can take longer than 45s even when Lighthouse succeeds. Keep
  // both attempts inside the crawl's 150s budget, leaving time for rendering.
  const deadline = Date.now() + 150000;
  const startedAt = Date.now();
  let result = await requestPageSpeed(url, strategy, 120000);
  let attempts = 1;
  if (result.unavailable && result.retryable) {
    await new Promise((resolve) => setTimeout(resolve, 1500));
    const remaining = deadline - Date.now();
    if (remaining > 0) {
      result = await requestPageSpeed(url, strategy, remaining);
      attempts += 1;
    }
  }
  return { ...result, measurement: {
    status: result.unavailable ? 'unavailable' : 'available',
    reason: result.reason || null,
    httpStatus: result.status || null,
    attempts,
    elapsedMs: Date.now() - startedAt,
    observedAt: new Date().toISOString(),
  } };
}

async function requestPageSpeed(url, strategy, timeoutMs) {
  const apiKey = process.env.GOOGLE_PAGESPEED_API_KEY || '';
  const keyParam = apiKey ? `&key=${encodeURIComponent(apiKey)}` : '';
  // Desktop supplies only the performance score. Other categories are consumed
  // from mobile; requesting them on desktop adds unnecessary work.
  const categories = strategy === 'desktop' ? 'category=performance' : 'category=performance&category=accessibility&category=seo&category=best-practices';
  const apiUrl = `https://www.googleapis.com/pagespeedonline/v5/runPagespeed?url=${encodeURIComponent(url)}&strategy=${strategy}&${categories}${keyParam}`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(apiUrl, {
      signal: controller.signal,
      headers: { Accept: 'application/json' },
    });

    if (!response.ok) {
      // Some Lighthouse failures are HTTP 400, rather than 5xx. Classify only
      // known transient codes and never keep the provider's private error text.
      let body;
      try { body = JSON.parse(await response.text()); } catch {}
      const lighthouseTransient = /\b(PROTOCOL_TIMEOUT|NAVIGATION_TIMEOUT|NO_FCP|NO_LCP)\b/.test(body?.error?.message || '');
      const reason = response.status === 429 ? 'rate_limited'
        : response.status === 401 || response.status === 403 ? 'access_denied'
        : lighthouseTransient ? 'lighthouse_error' : 'api_error';
      return unavailable(reason, response.status, response.status === 429 || response.status >= 500 || lighthouseTransient);
    }

    const data = await response.json();
    if (data?.lighthouseResult?.runtimeError) return unavailable('lighthouse_error', response.status, true);
    if (extractCategoryScore(data, 'performance') == null) return unavailable('no_performance_score', response.status, true);
    return { ...data, status: response.status };
  } catch (error) {
    return unavailable(controller.signal.aborted ? 'request_timeout' : 'request_failed', 0, true);
  } finally {
    clearTimeout(timeout);
  }
}

function unavailable(reason, status, retryable) {
  return { unavailable: true, reason, status, retryable };
}

function extractCategoryScore(data, category) {
  const score = data?.lighthouseResult?.categories?.[category]?.score;
  return Number.isFinite(score) && score >= 0 && score <= 1 ? Math.round(score * 100) : null;
}

function extractPerformanceMetrics(pageSpeedData) {
  const audits = pageSpeedData?.lighthouseResult?.audits;
  if (!audits) {
    return {
      available: false,
      firstContentfulPaint: 'Unknown',
      largestContentfulPaint: 'Unknown',
      totalBlockingTime: 'Unknown',
      cumulativeLayoutShift: 'Unknown',
      speedIndex: 'Unknown',
      interactionToNextPaint: 'Unknown',
    };
  }

  return {
    available: true,
    firstContentfulPaint: audits['first-contentful-paint']?.displayValue || 'Unknown',
    largestContentfulPaint: audits['largest-contentful-paint']?.displayValue || 'Unknown',
    totalBlockingTime: audits['total-blocking-time']?.displayValue || 'Unknown',
    cumulativeLayoutShift: audits['cumulative-layout-shift']?.displayValue || 'Unknown',
    speedIndex: audits['speed-index']?.displayValue || 'Unknown',
    interactionToNextPaint: audits['experimental-interaction-to-next-paint']?.displayValue || 'Unknown',
  };
}
