import { afterEach, describe, expect, it, vi } from 'vitest';
vi.mock('playwright-core',()=>({chromium:{connect:vi.fn()}}));
import { chromium } from 'playwright-core';
import { renderOnePage } from '../lib/audit/render.js';

afterEach(()=>{vi.useRealTimers();vi.clearAllMocks();});
describe('provider cleanup cannot hold up a rendered evidence result',()=>{
  it('classifies provider 429 without logging its credential-bearing response',async()=>{
    const warning=vi.spyOn(console,'warn').mockImplementation(()=>{});
    chromium.connect.mockRejectedValueOnce(Error('WebSocket error 429 Too Many Requests wss://browser.example?token=PRIVATE_RESPONSE_TOKEN'));
    try {
      await expect(renderOnePage('https://agency.example/',{env:{RENDER_BROWSER_WS_ENDPOINT:'wss://browser.example/playwright'},deadline:Date.now()+10000})).rejects.toThrow('browser_rate_limited');
      expect(warning).toHaveBeenCalledWith('Browser renderer connection failed:','browser_rate_limited');
    } finally {warning.mockRestore();}
  });
  it('returns extracted HTML after bounded cleanup even when close never resolves',async()=>{
    vi.useFakeTimers();
    const html='<main><h1>Agency</h1><p>We provide accessible public website design services with clear company information and experienced ongoing support.</p></main>';
    const page={route:vi.fn().mockResolvedValue(undefined),goto:vi.fn().mockResolvedValue({ok:()=>true}),url:()=> 'https://agency.example/',content:vi.fn().mockResolvedValue(html)};
    const browser={newContext:vi.fn().mockResolvedValue({newPage:vi.fn().mockResolvedValue(page)}),close:vi.fn(()=>new Promise(()=>{}))};
    chromium.connect.mockResolvedValue(browser);
    const run=renderOnePage('https://agency.example/',{env:{RENDER_BROWSER_WS_ENDPOINT:'wss://browser.example/playwright'},deadline:Date.now()+10000});
    await vi.advanceTimersByTimeAsync(2000);
    expect(await run).toEqual({html});
    expect(browser.close).toHaveBeenCalledOnce();
  });
});
