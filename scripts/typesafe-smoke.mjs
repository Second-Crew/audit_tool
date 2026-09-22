// Uses synthetic public-style content only. Never prints environment values.
// Run: vercel env run -e preview -- ./node_modules/.bin/vite-node scripts/typesafe-smoke.mjs
import { evaluateTypeSafe } from '../lib/audit/typesafe.js';

const html = `<html><head><title>Drain clearing service</title></head><body>
<nav>Contact About</nav><main><h1>Drain clearing for homes</h1>
<p>We clear blocked kitchen and bathroom drains. A technician first checks the accessible trap and asks which fixtures drain slowly. If the blockage is farther down the pipe, the technician explains whether a cable or water jet is appropriate before starting.</p>
<p>A standard visit takes 60 to 90 minutes. The quote includes inspection and clearing one accessible drain. Excavation and replacement pipes require a separate written quote. Please keep the area under the sink clear before the visit.</p>
</main><script>FAQ certified award winning testimonials</script></body></html>`;
const result = await evaluateTypeSafe({ pages: [{ url: 'https://example.com/services/drains', status: 200, html }] }, {env:{...process.env,TYPESAFE_AUDIT_MODE:'shadow'}});
console.log(JSON.stringify({
  status: result.status, reason: result.reason, score: result.score,
  coverage: result.coverage, usage: result.usage, elapsedMs: result.elapsedMs,
  pages: result.pages.map(({ pageType, dimensions, reason, model }) => ({ pageType, dimensions, reason, model })),
}, null, 2));
if (!['completed', 'partial'].includes(result.status)) process.exitCode = 1;
