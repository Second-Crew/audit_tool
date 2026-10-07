import { afterEach, describe, expect, it, vi } from 'vitest';
import { getPageSpeedBundle } from '../lib/audit/pagespeed.js';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('PageSpeed availability', () => {
  it('retries a transient desktop failure without inventing a score', async () => {
    const desktopFailure = { ok: false, status: 503, text: async () => 'temporarily unavailable' };
    const result = (score) => ({ ok: true, json: async () => ({ lighthouseResult: { categories: { performance: { score } } } }) });
    let desktopCalls = 0;
    const fetchMock = vi.fn(async (url) => {
      if (url.includes('strategy=mobile')) return result(0.5);
      desktopCalls += 1;
      return desktopCalls === 1 ? desktopFailure : result(0.8);
    });
    vi.stubGlobal('fetch', fetchMock);
    const bundle = await getPageSpeedBundle('https://agency.example/');
    expect(bundle.scores).toMatchObject({ mobile: 50, desktop: 80 });
    expect(desktopCalls).toBe(2);
    expect(bundle.diagnostics.desktop).toMatchObject({ status: 'available', attempts: 2 });
    const desktopUrl = fetchMock.mock.calls.find(([url]) => url.includes('strategy=desktop'))[0];
    expect(new URL(desktopUrl).searchParams.getAll('category')).toEqual(['performance']);
  });

  it('does not retry a permission error and leaves the unavailable score null', async () => {
    const fetchMock = vi.fn(async () => ({ ok: false, status: 403, text: async () => 'forbidden' }));
    vi.stubGlobal('fetch', fetchMock);
    const bundle = await getPageSpeedBundle('https://agency.example/');
    expect(bundle.scores).toMatchObject({ mobile: null, desktop: null });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(bundle.diagnostics.desktop).toMatchObject({ status: 'unavailable', reason: 'access_denied', attempts: 1 });
  });

  it('waits for a desktop measurement that takes longer than the old 45s deadline', async () => {
    vi.useFakeTimers();
    const result = score => ({ ok: true, json: async () => ({ lighthouseResult: { categories: { performance: { score } } } }) });
    const fetchMock = vi.fn(async (url, {signal}) => {
      if (url.includes('strategy=mobile')) return result(0.58);
      await new Promise((resolve, reject) => {
        const timer = setTimeout(resolve, 55000);
        signal.addEventListener('abort', () => { clearTimeout(timer); reject(new DOMException('aborted', 'AbortError')); }, {once:true});
      });
      return result(0.9);
    });
    vi.stubGlobal('fetch', fetchMock);
    const pending = getPageSpeedBundle('https://agency.example/');
    await vi.advanceTimersByTimeAsync(55000);
    const bundle = await pending;
    expect(bundle.scores).toMatchObject({mobile:58, desktop:90});
    expect(bundle.diagnostics.desktop).toMatchObject({status:'available',attempts:1,elapsedMs:55000});
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('bounds timed-out retries within 150s and retains only a safe failure reason', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('fetch', vi.fn(async (url, {signal}) => {
      if(url.includes('strategy=mobile')) return {ok:true,json:async()=>({lighthouseResult:{categories:{performance:{score:0.5}}}})};
      return new Promise((_resolve,reject) => signal.addEventListener('abort',()=>reject(new DOMException('secret request URL', 'AbortError')),{once:true}));
    }));
    const pending = getPageSpeedBundle('https://agency.example/');
    await vi.advanceTimersByTimeAsync(150000);
    const bundle = await pending;
    expect(bundle.scores).toMatchObject({mobile:50,desktop:null});
    expect(bundle.diagnostics.desktop).toMatchObject({status:'unavailable',reason:'request_timeout',attempts:2,elapsedMs:150000});
    expect(JSON.stringify(bundle)).not.toContain('secret');
  });

  it('discards a Lighthouse runtime error even when it includes a numeric score, then retries', async () => {
    let calls=0;
    vi.stubGlobal('fetch', vi.fn(async url => ({ok:true,status:200,json:async()=>({lighthouseResult:{
      ...(url.includes('strategy=desktop') && ++calls===1 ? {runtimeError:{code:'NO_FCP',message:'private provider details'}} : {}),
      categories:{performance:{score:url.includes('strategy=mobile') ? 0 : 0.8}},
    }})})));
    const bundle=await getPageSpeedBundle('https://agency.example/');
    expect(bundle.scores).toMatchObject({mobile:0,desktop:80});
    expect(bundle.diagnostics.desktop.attempts).toBe(2);
    expect(JSON.stringify(bundle)).not.toContain('private provider details');
  });

  it('retries a known transient Lighthouse HTTP 400 error without retaining the body', async () => {
    let desktopCalls=0;
    vi.stubGlobal('fetch',vi.fn(async url => {
      if(url.includes('strategy=desktop') && ++desktopCalls===1) return {ok:false,status:400,text:async()=>JSON.stringify({error:{message:'Lighthouse returned error: PROTOCOL_TIMEOUT https://api.example?key=private-key'}})};
      return {ok:true,status:200,json:async()=>({lighthouseResult:{categories:{performance:{score:0.7}}}})};
    }));
    const bundle=await getPageSpeedBundle('https://agency.example/');
    expect(bundle.scores.desktop).toBe(70);
    expect(desktopCalls).toBe(2);
    expect(JSON.stringify(bundle)).not.toContain('private-key');
  });

  it('keeps missing or invalid numeric results unavailable after a bounded retry', async () => {
    vi.stubGlobal('fetch',vi.fn(async()=>({ok:true,status:200,json:async()=>({lighthouseResult:{categories:{performance:{score:'0.9'}}}})})));
    const bundle=await getPageSpeedBundle('https://agency.example/');
    expect(bundle.scores).toMatchObject({mobile:null,desktop:null});
    expect(bundle.available).toBe(false);
    expect(bundle.diagnostics.desktop).toMatchObject({reason:'no_performance_score',attempts:2});
  });
});
