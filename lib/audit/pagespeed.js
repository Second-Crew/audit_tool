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
    available: Boolean(mobile?.lighthouseResult || desktop?.lighthouseResult),
  };
}

async function getPageSpeedData(url, strategy) {
  const apiKey = process.env.GOOGLE_PAGESPEED_API_KEY || '';
  const keyParam = apiKey ? `&key=${encodeURIComponent(apiKey)}` : '';
  const apiUrl = `https://www.googleapis.com/pagespeedonline/v5/runPagespeed?url=${encodeURIComponent(url)}&strategy=${strategy}&category=performance&category=accessibility&category=seo&category=best-practices${keyParam}`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 45000);

  try {
    const response = await fetch(apiUrl, {
      signal: controller.signal,
      headers: { Accept: 'application/json' },
    });

    if (!response.ok) {
      return {
        unavailable: true,
        status: response.status,
        error: await response.text(),
      };
    }

    return await response.json();
  } catch (error) {
    return {
      unavailable: true,
      status: 0,
      error: error.name === 'AbortError' ? 'PageSpeed request timed out' : error.message,
    };
  } finally {
    clearTimeout(timeout);
  }
}

function extractCategoryScore(data, category) {
  const score = data?.lighthouseResult?.categories?.[category]?.score;
  return typeof score === 'number' ? Math.round(score * 100) : null;
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
    interactionToNextPaint: audits['experimental-interaction-to-next-paint']?.displayValue || audits['interactive']?.displayValue || 'Unknown',
  };
}
