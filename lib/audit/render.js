import * as cheerio from 'cheerio';
import { cleanContent } from './evidence.js';
import { assertPublicHttpUrl } from './url.js';
import { isCriticalPageUrl } from './page-priority.js';

const MAX_RENDER_PAGES = 80;
const MAX_RENDER_MS = 180000;
const MAX_HTML_BYTES = 900000;

export function needsRendering(page) {
  if (!page?.html || page.truncated || page.rendered) return false;
  const $ = cheerio.load(page.html);
  return $('script').length > 0 && cleanContent($).length < 80;
}

// Rendering is a second, bounded evidence pass over URLs already permitted by
// robots and fetched by the crawler. A failed render never turns into a defect.
export async function renderSparsePages(crawl, {env=process.env, renderer=renderOnePage, maxPages=MAX_RENDER_PAGES}={}) {
  const candidates=crawl.pages.filter(needsRendering);
  const selected=candidates.slice(0,maxPages);
  const configured=Boolean(env.RENDER_BROWSER_WS_ENDPOINT || env.RENDER_CHROME_EXECUTABLE_PATH || renderer!==renderOnePage);
  const summary={candidates:candidates.length,attempted:0,retryAttempts:0,succeeded:0,failed:0,skipped:candidates.length-selected.length,configured,failureReasons:{}};
  if(!selected.length || !configured) {
    crawl.summary.rendering=summary;
    return crawl;
  }
  const deadline=Date.now()+MAX_RENDER_MS;
  let cursor=0;
  const failures=new Map();
  async function attempt(page) {
    try {
      const result=await renderer(page.url,{env,deadline});
      if(!result?.html || Buffer.byteLength(result.html)>MAX_HTML_BYTES) throw Error('oversized_or_empty_render');
      const $=cheerio.load(result.html);
      const clean=cleanContent($);
      const articlePath=/\/blog\/[^/]+/i.test(new URL(page.url).pathname);
      if(clean.length<80 || (articlePath && clean.length<500)) throw Error('rendered_text_insufficient');
      page.fetchedHtml=page.html;
      page.html=result.html;
      page.rendered=true;
      page.renderStatus='success';
      page.observedAt=new Date().toISOString();
      failures.delete(page);
      summary.succeeded++;
    } catch(error) {
      page.renderStatus='unavailable';
      // Keep provider responses and secret-bearing WebSocket URLs out of reports.
      failures.set(page,SAFE_RENDER_ERRORS.has(error?.message)?error.message:'render_browser_error');
    }
  }
  async function worker() {
    while(cursor<selected.length && Date.now()<deadline) {
      const page=selected[cursor++];summary.attempted++;
      await attempt(page);
    }
  }
  await Promise.all(Array.from({length:Math.min(2,selected.length)},worker));
  // A transient browser failure on the homepage or a top-level landing page can
  // change the site's grade. Give these pages one more bounded attempt.
  for(const page of selected.filter(page=>failures.has(page) && isCriticalPageUrl(page.url)).slice(0,8)) {
    if(Date.now()>=deadline) break;
    summary.retryAttempts++;
    await attempt(page);
  }
  summary.failed=failures.size;
  for(const reason of failures.values()) summary.failureReasons[reason]=(summary.failureReasons[reason]||0)+1;
  summary.skipped += selected.length-summary.attempted;
  crawl.summary.rendering=summary;
  return crawl;
}

export async function renderOnePage(url,{env,deadline}) {
  // Import only when rendering is configured. The CLI/worker can use a local
  // Chrome executable; Vercel can connect to a separately provisioned browser.
  const {chromium}=await import('playwright-core');
  const remaining=Math.min(18000,Math.max(1000,deadline-Date.now()));
  let browser;
  try {
    browser=env.RENDER_BROWSER_WS_ENDPOINT
      ? await chromium.connect(normalizeBrowserEndpoint(env.RENDER_BROWSER_WS_ENDPOINT),{timeout:remaining})
      : await chromium.launch({executablePath:env.RENDER_CHROME_EXECUTABLE_PATH,headless:true,timeout:remaining});
  } catch(error) {
    console.warn('Browser renderer connection failed:',sanitizeConnectionError(error,env.RENDER_BROWSER_WS_ENDPOINT));
    throw Error(connectionFailureCode(error));
  }
  try {
    const context=await browser.newContext({serviceWorkers:'block',acceptDownloads:false});
    const page=await context.newPage();
    await page.route('**/*',async route=>{
      const requestUrl=route.request().url();
      try {
        if(!isAllowedRenderHost(requestUrl,url)) return await route.abort();
        await assertPublicHttpUrl(requestUrl);
        await route.continue();
      }catch{await route.abort().catch(()=>{});}
    });
    const response=await page.goto(url,{waitUntil:'domcontentloaded',timeout:remaining});
    if(!response?.ok() || !isAllowedRenderHost(page.url(),url)) throw Error('render_navigation_failed');
    // A navigation/footer shell can satisfy body.innerText before the site's
    // asynchronous content arrives. Wait on the same cleaned evidence that
    // extraction actually consumes, giving core pages extra recovery time.
    const html=await waitForContentHtml(page,url,Math.min(deadline,Date.now()+(isCriticalPageUrl(url)?30000:12000)));
    return {html};
  }finally{await browser.close().catch(()=>{});}
}

export async function waitForContentHtml(page,url,deadline) {
  const threshold=/\/blog\/[^/]+/i.test(new URL(url).pathname)?500:80;
  let html;
  do {
    html=await page.content();
    if(cleanContent(cheerio.load(html)).length>=threshold || Date.now()>=deadline) return html;
    await page.waitForTimeout(Math.min(250,Math.max(1,deadline-Date.now())));
  } while(Date.now()<deadline);
  return html;
}

const SAFE_RENDER_ERRORS=new Set([
  'oversized_or_empty_render','rendered_text_insufficient','render_navigation_failed',
  'browser_endpoint_invalid',
  'browser_auth_failed','browser_endpoint_not_found','browser_protocol_error',
  'browser_connection_timeout','browser_connection_failed',
]);

function connectionFailureCode(error) {
  const message=String(error?.message||'');
  if (SAFE_RENDER_ERRORS.has(message)) return message;
  if (/\b(401|403)\b|unauthori[sz]ed|forbidden/i.test(message)) return 'browser_auth_failed';
  if (/\b404\b|not found/i.test(message)) return 'browser_endpoint_not_found';
  if (/protocol|version mismatch/i.test(message)) return 'browser_protocol_error';
  if (/timeout|timed out/i.test(message)) return 'browser_connection_timeout';
  return 'browser_connection_failed';
}

export function normalizeBrowserEndpoint(value) {
  let endpoint=String(value||'').trim();
  if (endpoint.length>=2 && ['"',"'",'`'].includes(endpoint[0]) && endpoint.at(-1)===endpoint[0]) {
    endpoint=endpoint.slice(1,-1).trim();
  }
  let parsed;
  try { parsed=new URL(endpoint); } catch { throw Error('browser_endpoint_invalid'); }
  if (parsed.protocol!=='wss:') throw Error('browser_endpoint_invalid');
  if (parsed.hostname==='browserless.io' || parsed.hostname.endsWith('.browserless.io')) {
    if (parsed.pathname!=='/chromium/playwright') throw Error('browser_endpoint_invalid');
    const token=parsed.searchParams.get('token');
    if (!token || /^(?:YOUR_TOKEN|<YOUR_TOKEN>|YOUR_BROWSERLESS_TOKEN)$/i.test(token)) throw Error('browser_auth_failed');
  }
  return endpoint;
}

export function sanitizeConnectionError(error,endpoint='') {
  let message=String(error?.message||'').replaceAll(endpoint||'\0','[browser endpoint]');
  try {
    const parsed=new URL(endpoint);
    for (const value of [parsed.username,parsed.password,...parsed.searchParams.values()]) {
      if (!value) continue;
      message=message.replaceAll(value,'[redacted]').replaceAll(encodeURIComponent(value),'[redacted]');
    }
  } catch {}
  return message
    .replace(/(?:wss?|https?):\/\/[^\s`"'<>]+/gi,'[url]')
    .replace(/\b(?:token|key|secret|password)=[^&\s]+/gi,'credential=[redacted]')
    .slice(0,240);
}

export function isAllowedRenderHost(requestUrl,rootUrl) {
  try {
    const target=new URL(requestUrl),root=new URL(rootUrl);
    if(!['http:','https:'].includes(target.protocol)) return false;
    const host=target.hostname.toLowerCase();
    const base=root.hostname.toLowerCase().replace(/^www\./,'');
    return host===base || host===`www.${base}` || host.endsWith(`.${base}`);
  }catch{return false;}
}
