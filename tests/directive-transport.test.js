import { Readable } from 'node:stream';
import { EventEmitter } from 'node:events';
import http from 'node:http';
import * as cheerio from 'cheerio';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../lib/audit/url.js', async importOriginal => ({
  ...await importOriginal(), assertPublicHttpUrl: vi.fn(async () => [{ address: '93.184.215.14', family: 4 }]),
}));
import { fetchText } from '../lib/audit/fetcher.js';
import { indexingDirectives } from '../lib/audit/evidence.js';

afterEach(() => vi.restoreAllMocks());
describe('directive transport preserves repeated HTTP field boundaries', () => {
  it('keeps unscoped restrictions separate from a previous crawler-scoped header', async () => {
    const request = vi.spyOn(http, 'request').mockImplementation((_url, options, callback) => {
      const req = new EventEmitter();
      req.end = () => {
        const response = Readable.from([Buffer.from('<main>Public content</main>')]);
        response.statusCode = 200;
        response.rawHeaders = ['Content-Type', 'text/html', 'X-Robots-Tag', 'bingbot: noindex', 'X-Robots-Tag', 'nosnippet'];
        callback(response);
      };
      return req;
    });
    const result = await fetchText('http://example.com/');
    expect(request).toHaveBeenCalledOnce();
    expect(result.ok).toBe(true);
    expect(result.headers['x-robots-tag']).toEqual(['bingbot: noindex', 'nosnippet']);
    expect(indexingDirectives(cheerio.load(result.body), result.headers)).toMatchObject({ indexAllowed: true, snippetAllowed: false });
  });
});
