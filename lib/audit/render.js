import * as cheerio from 'cheerio';
import { cleanContent } from './evidence.js';
import { assertPublicHttpUrl } from './url.js';

const MAX_RENDER_PAGES = 30;
const MAX_RENDER_MS = 100000;
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
  const summary={candidates:candidates.length,attempted:0,succeeded:0,failed:0,skipped:candidates.length-selected.length,configured};
  if(!selected.length || !configured) {
    crawl.summary.rendering=summary;
    return crawl;
  }
  const deadline=Date.now()+MAX_RENDER_MS;
  let cursor=0;
  async function worker() {
    while(cursor<selected.length && Date.now()<deadline) {
      const page=selected[cursor++];summary.attempted++;
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
        summary.succeeded++;
      } catch {
        page.renderStatus='unavailable';
        summary.failed++;
      }
    }
  }
  await Promise.all(Array.from({length:Math.min(2,selected.length)},worker));
  summary.skipped += selected.length-summary.attempted;
  crawl.summary.rendering=summary;
  return crawl;
}

export async function renderOnePage(url,{env,deadline}) {
  // Import only when rendering is configured. The CLI/worker can use a local
  // Chrome executable; Vercel can connect to a separately provisioned browser.
  const {chromium}=await import('playwright-core');
  const remaining=Math.min(18000,Math.max(1000,deadline-Date.now()));
  const browser=env.RENDER_BROWSER_WS_ENDPOINT
    ? await chromium.connect(env.RENDER_BROWSER_WS_ENDPOINT,{timeout:remaining})
    : await chromium.launch({executablePath:env.RENDER_CHROME_EXECUTABLE_PATH,headless:true,timeout:remaining});
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
    await page.waitForFunction(()=>(document.querySelector('main,[role=main]') || document.body)?.innerText?.trim().length>=80,null,{timeout:Math.min(12000,Math.max(500,deadline-Date.now()))}).catch(()=>{});
    const html=await page.content();
    return {html};
  }finally{await browser.close().catch(()=>{});}
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
