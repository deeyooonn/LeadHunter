import type { ScanResult } from '../../types/lead';
import { emptyContacts, hasContacts } from '../contact-data';
import { normalizeUrl, safeFetch, UnsafeUrlError, validatePublicUrl, type SafeResponse } from '../safe-fetch';
import { isSocialWebsite, normalizePhone, parsePage, socialLink } from './parse';

interface ScanOptions {
  signal?: AbortSignal; totalMs?: number; archive?: boolean; rendererUrl?: string;
  fetcher?: typeof safeFetch; validate?: (url: string) => Promise<unknown>;
  sleep?: (ms: number) => Promise<void>;
}
export function statusForHttp(status: number): ScanResult['status'] {
  if ([401, 403, 407, 429, 451].includes(status)) return 'BLOCKED';
  if ([404, 410].includes(status)) return 'DEAD_LINK';
  return status >= 200 && status < 300 ? 'NOTHING_FOUND' : 'ERROR';
}
export function urlVariants(value: string): string[] {
  const original = normalizeUrl(value);
  const variants: string[] = [original.href];
  for (const protocol of ['https:', 'http:']) for (const swap of [false, true]) {
    const url = new URL(original);
    url.protocol = protocol;
    if (swap) url.hostname = url.hostname.startsWith('www.') ? url.hostname.slice(4) : `www.${url.hostname}`;
    variants.push(url.href);
  }
  return [...new Set(variants)];
}
export async function scanWebsite(value: string, options: ScanOptions = {}): Promise<ScanResult> {
  options.signal?.throwIfAborted();
  const fetcher = options.fetcher ?? safeFetch;
  const validate = options.validate ?? validatePublicUrl;
  const deadline = Date.now() + (options.totalMs ?? 45000);
  const signal = AbortSignal.any([AbortSignal.timeout(options.totalMs ?? 45000), ...(options.signal ? [options.signal] : [])]);
  const validateTarget = async (target: string) => {
    signal.throwIfAborted();
    let abort = () => {};
    const cancelled = new Promise<never>((_, reject) => { abort = () => reject(new Error('Scan time budget exceeded or scan stopped.')); signal.addEventListener('abort', abort, { once: true }); });
    try { await Promise.race([validate(target), cancelled]); } finally { signal.removeEventListener('abort', abort); }
  };
  const pages: string[] = [];
  const cookies = new Map<string, string>();
  let status: ScanResult['status'] = 'ERROR', reason = 'The website could not be read.';
  let javascriptOnly = false, readable = false, blocked = false;
  const result = (source: ScanResult['source'] = 'website', contacts = emptyContacts()): ScanResult => ({ contacts, status: hasContacts(contacts) ? 'CONTACTS_FOUND' : status, reason: hasContacts(contacts) ? (source === 'archive' ? 'Contacts found in an archived snapshot; they may be outdated.' : source === 'renderer' ? 'Contacts found using the optional page renderer.' : 'Public contact details found.') : reason, scannedAt: new Date().toISOString(), pages: [...new Set(pages)], source });
  let url: URL;
  try { url = normalizeUrl(value); } catch (error) {
    status = 'BLOCKED'; reason = error instanceof Error ? error.message : 'Invalid URL.'; return result();
  }
  try {
    await validateTarget(url.href);
    if (isSocialWebsite(url.href)) {
      const link = socialLink(url.href);
      if (link) {
        const phone = link.platform === 'WhatsApp' ? normalizePhone(new URL(link.url).pathname.slice(1)) : null;
        return result('social', { phones: phone ? [phone] : [], emails: [], socials: [link] });
      }
      status = 'NOTHING_FOUND'; reason = 'This social URL is not a business profile. Social pages are not scraped.';
      return result('social');
    }
  } catch (error) {
    options.signal?.throwIfAborted();
    reason = error instanceof Error ? error.message : 'Invalid website URL.';
    status = error instanceof UnsafeUrlError ? 'BLOCKED' : /ENOTFOUND|EAI_AGAIN/.test(reason) ? 'DEAD_LINK' : 'ERROR';
    if (error instanceof UnsafeUrlError || signal.aborted) return result();
    // DNS/TLS failures may be specific to the original hostname. Try guarded variants.
  }
  const headers = [
    { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36', Accept: 'text/html,application/xhtml+xml', 'Accept-Language': 'en-PH,en;q=0.9' },
    { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14.0; rv:132.0) Gecko/20100101 Firefox/132.0', Accept: 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.8', 'Accept-Language': 'en-US,en;q=0.8' },
  ];
  const request = async (target: string, style = 0): Promise<SafeResponse | null> => {
    if (signal.aborted || Date.now() >= deadline - 300) return null;
    try {
      const response = await fetcher(target, { timeoutMs: Math.min(8000, deadline - Date.now()), maxBytes: 2_000_000, headers: headers[style], signal, cookies, stopAt: isSocialWebsite });
      pages.push(response.url);
      if (response.status === 429) {
        const retry = Number(response.headers['retry-after'] ?? 1);
        await (options.sleep ?? (ms => new Promise(resolve => setTimeout(resolve, ms))))(Math.min(2000, Math.max(250, Number.isFinite(retry) ? retry * 1000 : 1000)));
      }
      if (response.status < 200 || response.status >= 300) {
        const nextStatus = statusForHttp(response.status);
        blocked ||= nextStatus === 'BLOCKED';
        status = blocked ? 'BLOCKED' : nextStatus;
        reason = `Website returned HTTP ${response.status}${nextStatus === 'BLOCKED' ? ' (access restricted or rate limited)' : ''}.`;
        return null;
      }
      if (response.headers['content-type'] && !/html|text\/plain|xhtml/i.test(response.headers['content-type'])) { status = 'ERROR'; reason = 'The URL did not return a web page.'; return null; }
      if (/cf-chl-|cf-turnstile|g-recaptcha|<title>\s*(just a moment|access denied|attention required)/i.test(response.text) && /challenge|captcha|verify you are human/i.test(response.text)) { blocked = true; status = 'BLOCKED'; reason = 'The website requires a browser challenge or CAPTCHA. It was not bypassed.'; return null; }
      // A redirect to a social site must not be parsed as a business website.
      if (isSocialWebsite(response.url)) { status = 'NOTHING_FOUND'; reason = 'The website redirects to a social page.'; }
      readable = true;
      return response;
    } catch (error) {
      if (options.signal?.aborted) throw error;
      const message = error instanceof Error ? error.message : 'Network error';
      if (error instanceof UnsafeUrlError) { blocked = true; status = 'BLOCKED'; }
      else if (!blocked) status = /ENOTFOUND|ECONNREFUSED|certificate|CERT_|TLS/i.test(message) ? 'DEAD_LINK' : 'ERROR';
      reason = message;
      return null;
    }
  };
  let home: SafeResponse | null = null;
  const variants = urlVariants(url.href);
  // A readable page advances to parsing/crawling instead of repeatedly refetching it.
  for (let i = 0; i < Math.min(6, variants.length + 1) && !home; i++) home = await request(i < variants.length ? variants[i] : variants[0], i === variants.length ? 1 : 0);
  if (home) {
    const social = isSocialWebsite(home.url) ? socialLink(home.url) : null;
    if (social) return result('social', { phones: [], emails: [], socials: [social] });
    const parsed = parsePage(home.text, home.url);
    javascriptOnly = parsed.javascriptOnly;
    if (hasContacts(parsed.contacts)) return result('website', parsed.contacts);
    const paths = [...parsed.links, ...['/contact', '/contact-us', '/about', '/locations', '/support'].map(path => new URL(path, home.url).href)];
    for (const link of [...new Set(paths)].filter(link => link !== home?.url).slice(0, 5)) {
      const page = await request(link);
      if (!page || isSocialWebsite(page.url)) continue;
      const parsedPage = parsePage(page.text, page.url);
      if (hasContacts(parsedPage.contacts)) return result('website', parsedPage.contacts);
    }
  }
  if (!readable && options.archive !== false && !signal.aborted) {
    try {
      const available = await fetcher(`https://archive.org/wayback/available?url=${encodeURIComponent(url.href)}`, { timeoutMs: Math.min(5000, Math.max(1, deadline - Date.now())), signal, stopAt: isSocialWebsite, maxBytes: 100_000 });
      const data = JSON.parse(available.text) as { archived_snapshots?: { closest?: { available?: boolean; url?: string; timestamp?: string } } };
      const snapshot = data.archived_snapshots?.closest;
      if (snapshot?.available && snapshot.url && /^\d{14}$/.test(snapshot.timestamp ?? '')) {
        const saved = new URL(snapshot.url);
        if (saved.hostname === 'web.archive.org') {
          const original = saved.pathname.replace(/^\/web\/\d{14}(?:[a-z]{1,3}_)?\//, '') + saved.search;
          if (normalizeUrl(original).href === url.href) {
            const page = await fetcher(`https://web.archive.org/web/${snapshot.timestamp}id_/${url.href}`, { timeoutMs: Math.min(8000, Math.max(1, deadline - Date.now())), signal, stopAt: isSocialWebsite, maxBytes: 2_000_000 });
            pages.push(page.url);
            if (page.status === 200) { const parsed = parsePage(page.text, url.href); if (hasContacts(parsed.contacts)) return result('archive', parsed.contacts); }
          }
        }
      }
    } catch { /* Preserve the original, more useful website failure. */ }
  }
  if (javascriptOnly && options.rendererUrl && !signal.aborted) {
    try {
      await validateTarget(url.href);
      const page = await fetcher(options.rendererUrl, { method: 'POST', body: JSON.stringify({ url: url.href }), headers: { 'Content-Type': 'application/json', Accept: 'text/html' }, timeoutMs: Math.min(10000, Math.max(1, deadline - Date.now())), signal, stopAt: isSocialWebsite, maxBytes: 2_000_000 });
      if (page.status === 200) { const parsed = parsePage(page.text, url.href); if (hasContacts(parsed.contacts)) return result('renderer', parsed.contacts); }
    } catch { /* Renderer rescue is optional; it must not hide the original outcome. */ }
  }
  if (readable) { status = 'NOTHING_FOUND'; reason = javascriptOnly ? 'No contacts found in the available HTML. This site appears to require JavaScript.' : 'No public contacts found on the homepage or contact-like pages.'; }
  if (signal.aborted && !options.signal?.aborted) { status = 'ERROR'; reason = 'The scan reached its total time budget before all layers could finish.'; }
  options.signal?.throwIfAborted();
  return result();
}
