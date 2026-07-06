import dns from 'dns/promises';
import net from 'net';

const PRIVATE_HOSTS = new Set(['localhost', 'localhost.localdomain']);

export function normalizeAuditUrl(input) {
  if (!input || typeof input !== 'string') {
    throw new Error('A website URL or domain is required');
  }

  const trimmed = input.trim();
  const withProtocol = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  const parsed = new URL(withProtocol);

  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new Error('Only HTTP and HTTPS URLs can be audited');
  }

  parsed.hash = '';
  return parsed.toString();
}

export function getOrigin(url) {
  return new URL(url).origin;
}

export function getDomain(url) {
  return new URL(url).hostname.replace(/^www\./i, '').toLowerCase();
}

export function canonicalizeUrl(url) {
  const parsed = new URL(url);
  parsed.hash = '';

  const removableParams = [
    'utm_source',
    'utm_medium',
    'utm_campaign',
    'utm_term',
    'utm_content',
    'gclid',
    'fbclid',
  ];
  removableParams.forEach((param) => parsed.searchParams.delete(param));

  const value = parsed.toString();
  return value.endsWith('/') ? value.slice(0, -1) : value;
}

export function isSameSite(url, rootUrl) {
  try {
    const target = new URL(url);
    const root = new URL(rootUrl);
    const targetHost = target.hostname.replace(/^www\./i, '').toLowerCase();
    const rootHost = root.hostname.replace(/^www\./i, '').toLowerCase();
    return targetHost === rootHost;
  } catch {
    return false;
  }
}

export function toAbsoluteUrl(href, baseUrl) {
  try {
    if (!href || typeof href !== 'string') return null;
    if (/^(mailto|tel|sms|javascript):/i.test(href)) return null;

    const url = new URL(href, baseUrl);
    if (!['http:', 'https:'].includes(url.protocol)) return null;
    url.hash = '';
    return canonicalizeUrl(url.toString());
  } catch {
    return null;
  }
}

export function looksLikeHtmlPage(url) {
  const pathname = new URL(url).pathname.toLowerCase();
  return !/\.(avif|bmp|css|csv|doc|docx|gif|ico|jpeg|jpg|js|json|mp3|mp4|mov|pdf|png|svg|webm|webp|woff|woff2|xls|xlsx|xml|zip)$/i.test(pathname);
}

export async function assertPublicHttpUrl(url) {
  const parsed = new URL(url);
  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new Error('Only HTTP and HTTPS URLs can be fetched');
  }

  const host = parsed.hostname.toLowerCase();
  if (PRIVATE_HOSTS.has(host) || host.endsWith('.local')) {
    throw new Error('Private or local hostnames cannot be audited');
  }

  const directIpVersion = net.isIP(host);
  if (directIpVersion && isPrivateIp(host)) {
    throw new Error('Private IP addresses cannot be audited');
  }

  if (!directIpVersion) {
    let addresses = [];
    try {
      addresses = await dns.lookup(host, { all: true, verbatim: true });
    } catch {
      return;
    }

    if (addresses.some((entry) => isPrivateIp(entry.address))) {
      throw new Error('Host resolves to a private IP address');
    }
  }
}

function isPrivateIp(ip) {
  const version = net.isIP(ip);
  if (!version) return false;

  if (version === 4) {
    const parts = ip.split('.').map((part) => Number.parseInt(part, 10));
    const [a, b] = parts;
    return (
      a === 0 ||
      a === 10 ||
      a === 127 ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      a >= 224
    );
  }

  const normalized = ip.toLowerCase();
  return (
    normalized === '::1' ||
    normalized.startsWith('fc') ||
    normalized.startsWith('fd') ||
    normalized.startsWith('fe80') ||
    normalized.startsWith('::ffff:127.') ||
    normalized.startsWith('::ffff:10.') ||
    normalized.startsWith('::ffff:192.168.')
  );
}
