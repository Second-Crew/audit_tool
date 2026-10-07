import { WEBSITE_TYPES, COMMERCE_MODES } from '../../../lib/audit/site-type.js';
import { NextResponse } from 'next/server';
import { runAudit } from '../../../lib/audit/index.js';
import { persistAudit } from '../../../lib/audit/persistence.js';
import { summarizeAuditForResponse } from '../../../lib/audit/summarize.js';
import { normalizeAuditUrl } from '../../../lib/audit/url.js';
import { scoreProspectVisibility } from '../../../lib/audit/prospect-visibility.js';
import { reserveDashboardAudit } from '../../../lib/dashboard-admission.js';

export const runtime = 'nodejs';
// Requires a host that allows long-running functions (Vercel Pro or a server deploy).
export const maxDuration = 300;

export async function POST(request) {
  const requestStartedAt = Date.now();
  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Request body must be valid JSON' }, { status: 400 });
  }

  const validationError = validateBody(body);
  if (validationError) {
    return NextResponse.json({ error: validationError }, { status: 400 });
  }

  if (body.visibilityPanel) {
    let assessment;
    try {
      assessment = scoreProspectVisibility(body.visibilityPanel, new URL(normalizeAuditUrl(body.url || body.domain)).hostname);
    } catch {
      return NextResponse.json({ error: 'The website URL or observed-visibility panel is invalid.' }, { status: 400 });
    }
    if (assessment.status !== 'observed') {
      return NextResponse.json({ error: `Observed GEO/AEO score withheld: ${assessment.reason}` }, { status: 422 });
    }
  }

  const admission = await reserveDashboardAudit(request);
  if (!admission.allowed) {
    return NextResponse.json(
      { error: admission.error },
      { status: admission.status, headers: { 'Retry-After': String(admission.retryAfter) } }
    );
  }
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (payload) => {
        try {
          controller.enqueue(encoder.encode(`${JSON.stringify(payload)}\n`));
        } catch {
          // Client disconnected; keep the audit running so persistence still happens.
        }
      };

      try {
        const { audit, compatibility } = await runAudit(
          {
            url: body.url || body.domain,
            companyName: body.companyName || '',
            websiteType: body.websiteType || 'auto',
            ecommerceFunctionality: body.ecommerceFunctionality || 'auto',
            industry: body.industry || '',
            city: body.city || '',
            competitors: body.competitors || body.competitorUrls || [],
            // Reserve one minute for extraction, exports and bounded storage.
            // Keep the independent PageSpeed device budgets unchanged.
            deadlineMs: requestStartedAt + 240000,
            maxPages: body.maxPages || 250,
            maxDurationMs: body.maxDurationMs || 150000,
            maxCompetitorPages: body.maxCompetitorPages || 25,
            visibilityPanel: body.visibilityPanel || null,
          },
          (event) => send({ type: 'progress', ...event })
        );

        send({ type: 'progress', stage: 'persist' });
        const persistence = await persistAudit(audit, compatibility);

        send({
          type: 'result',
          data: {
            ...compatibility,
            audit: summarizeAuditForResponse(audit),
            persistence,
          },
        });
      } catch (error) {
        console.error('Website analysis could not be completed');
        send({ type: 'error', error: 'The audit could not be completed. Try again later.' });
      } finally {
        await admission.release();
        try {
          controller.close();
        } catch {
          // Already closed.
        }
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'application/x-ndjson; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      'X-Accel-Buffering': 'no',
    },
  });
}

function validateBody(body) {
  if (body && (!WEBSITE_TYPES.includes(body.websiteType || 'auto') || !COMMERCE_MODES.includes(body.ecommerceFunctionality || 'auto'))) return 'Invalid website type or ecommerce setting';
  if (!body || typeof body !== 'object') return 'A JSON body is required';

  const url = body.url || body.domain;
  if (!url || typeof url !== 'string') return 'A website URL or domain is required';
  if (url.length > 2048) return 'The website URL is too long';

  for (const field of ['companyName', 'industry', 'city']) {
    if (body[field] != null && (typeof body[field] !== 'string' || body[field].length > 200)) {
      return `"${field}" must be a string of at most 200 characters`;
    }
  }

  const competitors = body.competitors || body.competitorUrls;
  if (competitors != null && typeof competitors !== 'string' && !Array.isArray(competitors)) {
    return 'Competitors must be a string or an array of URLs';
  }
  if (typeof competitors === 'string' && competitors.length > 5000) {
    return 'The competitor list is too long';
  }
  if (Array.isArray(competitors) && competitors.length > 20) {
    return 'Provide at most 20 competitor URLs';
  }

  for (const field of ['maxPages', 'maxDurationMs', 'maxCompetitorPages']) {
    if (body[field] != null && !Number.isFinite(body[field])) {
      return `"${field}" must be a number`;
    }
  }

  if (body.visibilityPanel != null &&
      (typeof body.visibilityPanel !== 'object' || Array.isArray(body.visibilityPanel) || JSON.stringify(body.visibilityPanel).length > 250000)) {
    return 'Observed-visibility panel must be a JSON object under 250 KB';
  }

  return null;
}
