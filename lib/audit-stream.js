// Client-side reader for the NDJSON stream emitted by POST /api/analyze.
export async function readAuditStream(response, onProgress) {
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let result = null;
  const crawlContext = { maxPages: 250 };

  const handleLine = (line) => {
    if (!line.trim()) return;
    let event;
    try {
      event = JSON.parse(line);
    } catch {
      return;
    }

    if (event.type === 'error') throw new Error(event.error || 'Failed to generate report');
    if (event.type === 'result') {
      result = event.data;
      return;
    }
    if (event.type === 'progress') {
      onProgress(describeProgressEvent(event, crawlContext));
    }
  };

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    const lines = buffer.split('\n');
    buffer = lines.pop();
    for (const line of lines) handleLine(line);
  }
  handleLine(buffer);

  if (!result) throw new Error('The audit stream ended without a result. Try running the audit again.');
  return result;
}

export function describeProgressEvent(event, crawlContext) {
  switch (event.stage) {
    case 'start':
      crawlContext.maxPages = event.maxPages || 250;
      return { step: 'Preparing audit scope...', percent: 4 };
    case 'crawl': {
      const seen = (event.crawled || 0) + (event.queued || 0);
      const fraction = seen > 0 ? (event.crawled || 0) / Math.min(Math.max(seen, 1), crawlContext.maxPages) : 0;
      return {
        step: `Crawling site pages... ${event.crawled || 0} crawled`,
        percent: 5 + Math.round(Math.min(1, fraction) * 55),
      };
    }
    case 'crawl_done':
      return { step: `Crawl complete: ${event.crawled} pages`, percent: 62 };
    case 'pagespeed_done':
      return { step: 'PageSpeed checks finished', percent: 30 };
    case 'competitor':
      return {
        step: `Crawling competitor ${event.index} of ${event.total}...`,
        percent: 62 + Math.round((event.index / Math.max(event.total, 1)) * 10),
      };
    case 'scoring':
      return { step: 'Scoring technical and authority signals...', percent: 78 };
    case 'llm':
      return { step: 'Generating evidence-grounded narrative...', percent: 84 };
    case 'report':
      return { step: 'Assembling report workspace...', percent: 92 };
    case 'persist':
      return { step: 'Saving audit history...', percent: 96 };
    default:
      return { step: 'Working...', percent: 5 };
  }
}
