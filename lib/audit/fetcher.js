import http from 'node:http';
import https from 'node:https';
import { Readable } from 'node:stream';
import { assertPublicHttpUrl } from './url.js';

const DEFAULT_TIMEOUT_MS = 10000;
const DEFAULT_MAX_BYTES = 900_000;
const MAX_REDIRECTS = 5;
const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);

export async function fetchText(url, options = {}) {
  const {
    timeoutMs = DEFAULT_TIMEOUT_MS,
    maxBytes = DEFAULT_MAX_BYTES,
    accept = 'text/html,application/xhtml+xml,application/xml,text/plain;q=0.8,*/*;q=0.5',
    validatePublic = true,
  } = options;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  let currentUrl = url;

  try {
    // Follow redirects manually so every hop is re-validated: a public site
    // could otherwise redirect the crawler to a private/internal address.
    for (let redirects = 0; ; redirects += 1) {
      const addresses = validatePublic ? await assertPublicHttpUrl(currentUrl) : null;
      const response = await (addresses ? pinnedFetch : fetch)(currentUrl, {
        addresses,
        signal: controller.signal,
        redirect: 'manual',
        headers: {
          Accept: accept,
          'User-Agent': 'SecondCrewAuditBot/2.0 (+https://secondcrew.com)',
        },
      });

      if (REDIRECT_STATUSES.has(response.status)) {
        const location = response.headers.get('location');
        await response.body?.cancel().catch(() => {});
        if (!location || redirects >= MAX_REDIRECTS) {
          return {
            ok: false,
            status: response.status,
            url: currentUrl,
            headers: Object.fromEntries(response.headers.entries()),
            body: '',
            error: location ? 'Too many redirects' : 'Redirect without Location header',
          };
        }
        currentUrl = new URL(location, currentUrl).toString();
        continue;
      }

      const { text, truncated } = await readLimitedText(response, maxBytes);
      return {
        ok: response.ok,
        status: response.status,
        url: currentUrl,
        headers: Object.fromEntries(response.headers.entries()),
        body: text,
        truncated,
      };
    }
  } catch (error) {
    return {
      ok: false,
      status: 0,
      url: currentUrl,
      headers: {},
      body: '',
      error: error.name === 'AbortError' ? 'Request timed out' : error.message,
    };
  } finally {
    clearTimeout(timeout);
  }
}

async function readLimitedText(response, maxBytes) {
  if (!response.body) {
    const text = await response.text();
    return {
      text: text.slice(0, maxBytes),
      truncated: text.length > maxBytes,
    };
  }

  const reader = response.body.getReader();
  const chunks = [];
  let received = 0;
  let truncated = false;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    if (received + value.length > maxBytes) {
      chunks.push(value.slice(0, maxBytes - received));
      truncated = true;
      try {
        await reader.cancel();
      } catch {
        // Ignore stream cancellation failures.
      }
      break;
    }

    chunks.push(value);
    received += value.length;
  }

  const text = new TextDecoder('utf-8', { fatal: false }).decode(concatUint8Arrays(chunks));
  return { text, truncated };
}

function concatUint8Arrays(chunks) {
  const length = chunks.reduce((total, chunk) => total + chunk.length, 0);
  const output = new Uint8Array(length);
  let offset = 0;

  for (const chunk of chunks) {
    output.set(chunk, offset);
    offset += chunk.length;
  }

  return output;
}

// Pin the verified DNS answer to the connection, preventing a second DNS lookup
// from rebinding an allowed hostname to a private address. Every redirect repeats it.
export function pinnedFetch(url, {addresses,signal,headers}) {
  const parsed = new URL(url);
  return new Promise((resolve,reject)=>{
    const address=addresses[0];
    const request=(parsed.protocol==='https:'?https:http).request(parsed,{
      method:'GET',signal,headers,
      lookup:(_host,options,callback)=>options.all?callback(null,[address]):callback(null,address.address,address.family),
    }, response=>{
      const responseHeaders=new Headers();
      for(let i=0;i<response.rawHeaders.length;i+=2) responseHeaders.append(response.rawHeaders[i],response.rawHeaders[i+1]);
      const empty=[204,205,304].includes(response.statusCode);
      if(empty) response.resume();
      resolve(new Response(empty?null:Readable.toWeb(response),{status:response.statusCode,headers:responseHeaders}));
    });
    request.on('error',reject);request.end();
  });
}
