import { lookup } from 'node:dns/promises';
import type { LookupAddress, LookupAllOptions } from 'node:dns';
import { request as httpRequest } from 'node:http';
import { request as httpsRequest } from 'node:https';
import { gunzipSync, inflateSync, brotliDecompressSync } from 'node:zlib';
import ipaddr from 'ipaddr.js';

export class UnsafeUrlError extends Error {}
export interface SafeResponse { status: number; text: string; url: string; headers: Record<string, string>; }
export interface FetchOptions {
  timeoutMs?: number; maxBytes?: number; method?: 'GET' | 'POST' | 'PATCH'; body?: string;
  headers?: Record<string, string>; signal?: AbortSignal; cookies?: Map<string, string>;
  stopAt?: (url: string) => boolean;
}
export function normalizeUrl(value: string): URL {
  if (value.length > 4096) throw new UnsafeUrlError('URL is too long.');
  const input = value.trim();
  const url = new URL(/^[a-z][a-z0-9+.-]*:/i.test(input) ? input : `https://${input.replace(/^\/\//, '')}`);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || (url.port && !['80', '443'].includes(url.port))) throw new UnsafeUrlError('Only public HTTP/HTTPS websites on standard ports are allowed.');
  url.hash = '';
  return url;
}
export function isPublicAddress(address: string): boolean {
  try {
    let parsed = ipaddr.parse(address.replace(/^\[|\]$/g, ''));
    if (parsed.kind() === 'ipv6' && (parsed as ipaddr.IPv6).isIPv4MappedAddress()) parsed = (parsed as ipaddr.IPv6).toIPv4Address();
    return parsed.range() === 'unicast';
  } catch { return false; }
}
export async function validatePublicUrl(value: string, resolver: (host: string, options: LookupAllOptions) => Promise<LookupAddress[]> = lookup): Promise<{ url: URL; address: string; family: number }> {
  const url = normalizeUrl(value);
  const host = url.hostname.replace(/^\[|\]$/g, '').toLowerCase();
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') || !host.includes('.') && !host.includes(':')) throw new UnsafeUrlError('Local addresses are not allowed.');
  const addresses = ipaddr.isValid(host) ? [{ address: host, family: ipaddr.parse(host).kind() === 'ipv4' ? 4 : 6 }] : await resolver(host, { all: true, verbatim: true });
  if (!addresses.length || addresses.some(item => !isPublicAddress(item.address))) throw new UnsafeUrlError('Private, reserved, loopback, and link-local addresses are not allowed.');
  return { url, ...addresses[0] };
}

// Uses the validated IP for the actual socket, retaining the original hostname for TLS.
// Redirects re-enter the DNS/IP guard; no check-then-fetch DNS rebinding window.
export async function safeFetch(value: string, options: FetchOptions = {}): Promise<SafeResponse> {
  const deadline = Date.now() + (options.timeoutMs ?? 12000);
  const maxBytes = options.maxBytes ?? 2_000_000;
  const cookies = options.cookies ?? new Map<string, string>();
  let current = value, method = options.method ?? 'GET', body = options.body;
  const firstOrigin = normalizeUrl(value).origin;
  for (let redirects = 0; redirects <= 5; redirects++) {
    options.signal?.throwIfAborted();
    const remaining = deadline - Date.now();
    if (remaining <= 0) throw new Error('Request timed out.');
    let dnsTimer: ReturnType<typeof setTimeout> | undefined;
    const target = await Promise.race([
      validatePublicUrl(current),
      new Promise<never>((_, reject) => { dnsTimer = setTimeout(() => reject(new Error('DNS lookup timed out.')), remaining); }),
    ]).finally(() => clearTimeout(dnsTimer));
    if (redirects > 0 && options.stopAt?.(target.url.href)) return { status: 200, text: '', url: target.url.href, headers: {} };
    const headers = { ...options.headers, 'Accept-Encoding': 'identity' };
    if (target.url.origin !== firstOrigin) {
      for (const key of Object.keys(headers)) if (['authorization', 'cookie'].includes(key.toLowerCase())) delete (headers as Record<string, string>)[key];
    }
    const cookie = cookies.get(target.url.origin);
    const result = await new Promise<SafeResponse>((resolve, reject) => {
      const req = (target.url.protocol === 'https:' ? httpsRequest : httpRequest)(target.url, {
        method, headers: { ...headers, ...(cookie ? { Cookie: cookie } : {}) },
        family: target.family,
        ...{ autoSelectFamily: false },
        lookup: (_host, _opts, callback) => callback(null, target.address, target.family),
        signal: options.signal,
      }, response => {
        const responseHeaders: Record<string, string> = {};
        for (const [key, val] of Object.entries(response.headers)) if (val !== undefined) responseHeaders[key] = Array.isArray(val) ? val.join(', ') : val;
        const setCookies = response.headers['set-cookie'];
        if (setCookies) {
          const jar = new Map((cookies.get(target.url.origin) ?? '').split('; ').filter(Boolean).map(c => [c.split('=')[0], c]));
          for (const c of setCookies.slice(0, 20)) {
            const pair = c.split(';')[0], name = pair.split('=')[0];
            if (/max-age=0(?:;|$)/i.test(c)) jar.delete(name); else jar.set(name, pair);
          }
          cookies.set(target.url.origin, [...jar.values()].slice(-20).join('; '));
        }
        const status = response.statusCode ?? 0;
        if ([301, 302, 303, 307, 308].includes(status)) {
          response.destroy(); clearTimeout(timer);
          resolve({ status, text: '', headers: responseHeaders, url: target.url.href }); return;
        }
        const chunks: Buffer[] = [];
        let size = 0;
        response.on('data', (chunk: Buffer) => {
          size += chunk.length;
          if (size > maxBytes) { req.destroy(new Error('Page exceeds size limit.')); response.destroy(); }
          else chunks.push(chunk);
        });
        response.on('error', reject);
        response.on('end', () => {
          clearTimeout(timer);
          try {
            let bytes = Buffer.concat(chunks);
            const encoding = response.headers['content-encoding'];
            if (encoding === 'gzip') bytes = gunzipSync(bytes, { maxOutputLength: maxBytes });
            else if (encoding === 'deflate') bytes = inflateSync(bytes, { maxOutputLength: maxBytes });
            else if (encoding === 'br') bytes = brotliDecompressSync(bytes, { maxOutputLength: maxBytes });
            resolve({ status, text: bytes.toString('utf8'), headers: responseHeaders, url: target.url.href });
          } catch (error) { reject(error); }
        });
      });
      const timer = setTimeout(() => req.destroy(new Error('Request timed out.')), Math.max(1, deadline - Date.now()));
      req.on('error', error => { clearTimeout(timer); reject(error); });
      if (body) req.write(body);
      req.end();
    });
    if (![301, 302, 303, 307, 308].includes(result.status)) return result;
    if (!result.headers.location) throw new Error('Redirect is missing a destination.');
    current = new URL(result.headers.location, result.url).href;
    if (result.status === 303 || ((result.status === 301 || result.status === 302) && method === 'POST')) { method = 'GET'; body = undefined; }
  }
  throw new Error('Too many redirects.');
}
