import * as cheerio from 'cheerio';
import type { Contacts, SocialLink } from '../../types/lead';
import { emptyContacts, mergeContacts } from '../contact-data';

import { normalizePhone } from '../phones';
export { normalizePhone } from '../phones';

export function extractPhones(text: string): string[] {
  const found: string[] = [];
  for (const match of text.slice(0, 250_000).matchAll(/(?<![\d\w])(?:\+?63|0|(?=9\d{9}\b))[\s().-]{0,3}(?:\d[\s().-]{0,3}){8,10}\d(?!\d)/g)) {
    const phone = normalizePhone(match[0]); if (phone) found.push(phone);
  }
  return [...new Set(found)];
}
export function extractEmails(value: string): string[] {
  const text = value.slice(0, 250_000).replace(/\s{0,4}(?:\[at\]|\(at\))\s{0,4}/gi, '@').replace(/\s{0,4}(?:\[dot\]|\(dot\))\s{0,4}/gi, '.');
  return [...new Set((text.match(/[a-z0-9.!#$%&'*+/=?^_`{|}~-]{1,64}@[a-z0-9-]{1,63}(?:\.[a-z0-9-]{1,63}){1,5}/gi) ?? []).map(e => e.toLowerCase()).filter(email => {
    const [local, domain] = email.split('@');
    return !/\.(png|jpe?g|gif|webp|svg|ico|css|js|woff2?)$/i.test(domain) && !/(^|\.)(example\.(com|org|net)|test\.com|domain\.com|email\.com|sentry\.io|sentry\.wixpress\.com|wixpress\.com)$/i.test(domain) && !/^(yourname|youremail|email|test|noreply|no-reply)$/i.test(local) && /^[a-z]{2,24}$/i.test(domain.split('.').at(-1) ?? '');
  }))];
}
function decode(value: string): string { try { return decodeURIComponent(value); } catch { return value; } }
export function socialLink(value: string, base?: string): SocialLink | null {
  try {
    const url = new URL(value.startsWith('//') ? `https:${value}` : value, base);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) return null;
    let host = url.hostname.toLowerCase().replace(/^(www|m|web|mobile)\./, '');
    if (['facebook.com', 'fb.com'].includes(host) && url.pathname.startsWith('/plugins/')) return socialLink(url.searchParams.get('href') ?? '');
    const platforms: Record<string, string> = { 'facebook.com': 'Facebook', 'fb.com': 'Facebook', 'instagram.com': 'Instagram', 'linkedin.com': 'LinkedIn', 'twitter.com': 'X', 'x.com': 'X', 'youtube.com': 'YouTube', 'tiktok.com': 'TikTok', 'pinterest.com': 'Pinterest', 't.me': 'Telegram', 'wa.me': 'WhatsApp', 'api.whatsapp.com': 'WhatsApp', 'whatsapp.com': 'WhatsApp' };
    const platform = platforms[host]; if (!platform) return null;
    const path = url.pathname.replace(/\/+$/, '');
    if (!path || /\/(share|sharer|sharer\.php|intent|dialog|plugins|tr|login|watch|reel|reels|posts|photos|photo|videos|video|stories|status|p|embed|pin|groups|events|l\.php|explore|search|privacy|terms)(\/|\.|$)/i.test(path)) return null;
    const account = path.split('/').filter(Boolean).at(-1)?.toLowerCase();
    if (account && ['wix', 'wixcom', 'wordpress', 'wordpressdotcom', 'squarespace', 'webflow', 'godaddy', 'elementor', 'shopify', 'facebook', 'instagram'].includes(account)) return null;
    if (host === 'fb.com') host = 'facebook.com';
    if (host === 'twitter.com') host = 'x.com';
    if (platform === 'WhatsApp') {
      const phone = normalizePhone(url.searchParams.get('phone') ?? path.slice(1));
      return phone ? { platform, url: `https://wa.me/${phone.slice(1)}` } : null;
    }
    if (path === '/profile.php') {
      const id = url.searchParams.get('id');
      return platform === 'Facebook' && id && /^\d{1,30}$/.test(id) ? { platform, url: `https://facebook.com/profile.php?id=${id}` } : null;
    }
    if (platform === 'Facebook' && !/^\/(?:[^/]+|(?:people|pages)\/[^/]+\/\d+)$/.test(path)) return null;
    if (platform === 'Instagram' && !/^\/[a-z0-9_.]{1,30}$/i.test(path)) return null;
    if (platform === 'LinkedIn' && !/^\/(company|in|school)\/[^/]+$/i.test(path)) return null;
    if (platform === 'X' && !/^\/[a-z0-9_]{1,15}$/i.test(path)) return null;
    if (platform === 'YouTube' && !/^\/(?:@[^/]+|(?:channel|c|user)\/[^/]+)$/i.test(path)) return null;
    if (platform === 'TikTok' && !/^\/@[^/]+$/i.test(path)) return null;
    return { platform, url: `https://${host}${path}` };
  } catch { return null; }
}
export function isSocialWebsite(value: string): boolean {
  try { return /(^|\.)(facebook\.com|fb\.com|instagram\.com|linkedin\.com|twitter\.com|x\.com|youtube\.com|tiktok\.com|pinterest\.com|t\.me|wa\.me|whatsapp\.com)$/.test(new URL(value).hostname); } catch { return false; }
}
export function decodeCloudflare(encoded: string): string {
  if (!/^[0-9a-f]{4,512}$/i.test(encoded) || encoded.length % 2) return '';
  const key = parseInt(encoded.slice(0, 2), 16);
  const bytes: number[] = [];
  for (let i = 2; i < encoded.length; i += 2) bytes.push(parseInt(encoded.slice(i, i + 2), 16) ^ key);
  return Buffer.from(bytes).toString('utf8');
}
export function parsePage(html: string, base: string): { contacts: Contacts; links: string[]; javascriptOnly: boolean } {
  const source = html.slice(0, 2_000_000);
  const $ = cheerio.load(source);
  const contacts = emptyContacts();
  const addText = (value: string, phone = false) => {
    contacts.emails.push(...extractEmails(value));
    if (phone) contacts.phones.push(...extractPhones(value));
  };
  const addLink = (value: string) => {
    const decoded = decode(value);
    if (/^mailto:/i.test(decoded)) addText(decoded.slice(7).split('?')[0]);
    if (/^(tel|callto|sms):/i.test(decoded)) { const phone = normalizePhone(decoded.split(':').slice(1).join(':').split('?')[0]); if (phone) contacts.phones.push(phone); }
    if (/^viber:/i.test(decoded)) { const phone = normalizePhone(new URL(decoded).searchParams.get('number') ?? ''); if (phone) contacts.phones.push(phone); }
    if (/^whatsapp:/i.test(decoded)) {
      const phone = normalizePhone(new URL(decoded).searchParams.get('phone') ?? '');
      if (phone) { contacts.phones.push(phone); contacts.socials.push({ platform: 'WhatsApp', url: `https://wa.me/${phone.slice(1)}` }); }
    }
    const social = socialLink(value, base);
    if (social) {
      contacts.socials.push(social);
      if (social.platform === 'WhatsApp') { const phone = normalizePhone(new URL(social.url).pathname.slice(1)); if (phone) contacts.phones.push(phone); }
    }
  };
  $('a[href],iframe[src]').each((_, element) => addLink($(element).attr('href') ?? $(element).attr('src') ?? ''));
  $('[data-cfemail]').each((_, element) => addText(decodeCloudflare($(element).attr('data-cfemail') ?? '')));
  $('a[href*="/cdn-cgi/l/email-protection"]').each((_, element) => addText(decodeCloudflare(($(element).attr('href') ?? '').split('#')[1] ?? '')));
  $('[itemprop="email"],[itemprop="telephone"],[itemprop="sameAs"]').each((_, element) => {
    const value = $(element).attr('content') ?? $(element).attr('href') ?? $(element).text();
    addText(value, true); addLink(value);
  });
  let nodes = 0;
  const walk = (value: unknown, key = '', depth = 0): void => {
    if (depth > 12 || ++nodes > 10000) return;
    if (typeof value === 'string') {
      if (/email|telephone|phone|contact/i.test(key)) addText(value, true);
      if (/sameAs|url/i.test(key)) addLink(value);
    } else if (Array.isArray(value)) value.forEach(v => walk(v, key, depth + 1));
    else if (value && typeof value === 'object') for (const [k, v] of Object.entries(value)) walk(v, k, depth + 1);
  };
  $('script[type="application/ld+json"]').each((_, element) => { try { walk(JSON.parse($(element).text().slice(0, 250_000)) as unknown); } catch { /* Broken structured data must not prevent HTML parsing. */ } });
  const raw = source.replace(/\\u00([0-9a-f]{2})/gi, (_, hex: string) => String.fromCharCode(parseInt(hex, 16))).replace(/\\\//g, '/').replace(/&amp;/g, '&');
  // Bounded sweeps also find contacts in hidden attributes and escaped script strings.
  for (let i = 0; i < raw.length; i += 249000) addText(raw.slice(i, i + 250000));
  for (const match of raw.matchAll(/(?:https?:)?\/\/[^\s<>"'\\]{1,2048}/gi)) addLink(match[0]);
  for (const match of raw.matchAll(/(?:telephone|mobile|phone)["'\s:=]{1,8}(\+?[\d\s().-]{8,40})/gi)) { const phone = normalizePhone(match[1]); if (phone) contacts.phones.push(phone); }
  $('script,style,noscript,svg').remove();
  const visible = $('body').text(); addText(visible, true);
  const links: string[] = [];
  $('a[href]').each((_, element) => {
    const href = $(element).attr('href') ?? '';
    if (!/contact|about|location|support|reach|connect/i.test(`${href} ${$(element).text().slice(0, 100)}`)) return;
    try {
      const url = new URL(href, base);
      if (url.origin === new URL(base).origin && !/\.(pdf|jpe?g|png|zip)$/i.test(url.pathname)) { url.hash = ''; links.push(url.href); }
    } catch { /* Ignore malformed links. */ }
  });
  return { contacts: mergeContacts(contacts), links: [...new Set(links)].slice(0, 5), javascriptOnly: visible.trim().length < 160 && /<script|enable javascript|id=["'](?:root|app|__next)/i.test(source) };
}
