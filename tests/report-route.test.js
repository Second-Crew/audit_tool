import { describe, it, expect, vi } from 'vitest';
vi.mock('../lib/supabase.js',()=>({getSupabaseConfig:()=>({}),supabaseRequest:vi.fn()}));
import { supabaseRequest } from '../lib/supabase.js';
import { GET } from '../app/reports/[id]/route.js';

describe('saved report exports',()=>{
  it('serves the identical persisted Markdown as a download and a plain-text preview',async()=>{
    const markdown='# Saved audit\n\nPublic contact route: https://form.typeform.com/to/example\n';
    supabaseRequest.mockResolvedValue([{domain:'example.com',report:{markdown}}]);
    const params={id:'e24fbb09-9149-47b7-b7c7-adc500d8d40d'};
    const download=await GET({nextUrl:new URL('https://audit.example/reports/'+params.id+'?format=markdown')},{params});
    const preview=await GET({nextUrl:new URL('https://audit.example/reports/'+params.id+'?format=markdown&preview=1')},{params});
    expect(await download.text()).toBe(markdown);
    expect(await preview.text()).toBe(markdown);
    expect(download.headers.get('Content-Disposition')).toContain('attachment;');
    expect(preview.headers.get('Content-Disposition')).toContain('inline;');
    expect(preview.headers.get('Content-Type')).toContain('text/plain');
    expect(preview.headers.get('X-Content-Type-Options')).toBe('nosniff');
  });
});
