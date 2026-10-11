import test from 'node:test';
import assert from 'node:assert/strict';
import { decodeCloudflare, extractEmails, extractPhones, normalizePhone, parsePage, socialLink } from '../lib/scraper/parse';
import { scanWebsite, statusForHttp } from '../lib/scraper/scan';
import type { SafeResponse } from '../lib/safe-fetch';

test('normalizes Philippine mobile and landline formats', () => {
  for (const phone of ['+63 917 123 4567', '0917-123-4567', '09171234567', '639171234567']) assert.equal(normalizePhone(phone), '+639171234567');
  assert.equal(normalizePhone('(02) 8123-4567'), '+63281234567');
  assert.equal(normalizePhone('(046) 123-4567'), '+63461234567');
  assert.deepEqual(extractPhones('Call 0917 123 4567 or (02) 8123-4567.'), ['+639171234567', '+63281234567']);
  assert.equal(normalizePhone('2026-10-10'), null);
});
test('filters email junk across extraction layers', () => {
  assert.deepEqual(extractEmails('hello [at] company [dot] ph image@2x.png test@example.com abc@o1.ingest.sentry.io real@company.ph'), ['hello@company.ph', 'real@company.ph']);
});
test('extracts structured, obfuscated, hidden, messaging, and widget contacts', () => {
  const cf = '12' + [...'team@business.ph'].map(c => (c.charCodeAt(0) ^ 0x12).toString(16).padStart(2, '0')).join('');
  assert.equal(decodeCloudflare(cf), 'team@business.ph');
  const html = `<script type="application/ld+json">{"@type":"LocalBusiness","contactPoint":{"telephone":"09171234567","email":"hello@business.ph"},"sameAs":["https://linkedin.com/company/business"]}</script>
    <span data-cfemail="${cf}"></span><span>sales [at] business [dot] ph</span>
    <a href="mailto:one@business.ph,two@business.ph">Email</a><a href="https://wa.me/639181234567">WhatsApp</a>
    <meta itemprop="telephone" content="(02) 8123-4567"><span>encoded&#64;business.ph</span>
    <iframe src="https://www.facebook.com/plugins/page.php?href=https%3A%2F%2Ffacebook.com%2Fbusiness"></iframe>
    <script>const profile="https:\\/\\/instagram.com\\/business";</script>`;
  const { contacts } = parsePage(html, 'https://business.ph');
  for (const email of ['team@business.ph', 'hello@business.ph', 'sales@business.ph', 'one@business.ph', 'two@business.ph', 'encoded@business.ph']) assert.ok(contacts.emails.includes(email), email);
  for (const phone of ['+639171234567', '+639181234567', '+63281234567']) assert.ok(contacts.phones.includes(phone), phone);
  for (const platform of ['Facebook', 'Instagram', 'LinkedIn', 'WhatsApp']) assert.ok(contacts.socials.some(s => s.platform === platform), platform);
});
test('canonicalizes social profiles and rejects share, post, tracking, builder and impostor URLs', () => {
  assert.deepEqual(socialLink('https://m.facebook.com/business/?utm_source=site'), { platform: 'Facebook', url: 'https://facebook.com/business' });
  assert.equal(socialLink('https://facebook.com/profile.php?id=123&ref=site')?.url, 'https://facebook.com/profile.php?id=123');
  for (const url of ['https://evil.test/facebook.com/business', 'https://facebook.com.evil.test/business', 'https://facebook.com/sharer.php?u=site', 'https://facebook.com/business/posts/123', 'https://instagram.com/p/123', 'https://facebook.com/tr?id=123', 'https://instagram.com/wix', 'javascript:alert(1)']) assert.equal(socialLink(url), null, url);
});
const page = (url: string, text: string, status = 200): SafeResponse => ({ url, text, status, headers: { 'content-type': 'text/html' } });
const common = { validate: async () => {}, archive: false, sleep: async () => {} };
test('crawls a contact page only when the homepage has no contacts', async () => {
  const visited: string[] = [];
  const result = await scanWebsite('https://business.ph', { ...common, fetcher: async url => { visited.push(url); return page(url, url.endsWith('/contact') ? '<a href="tel:09171234567">Call</a>' : '<a href="/contact">Contact</a>'); } });
  assert.equal(result.status, 'CONTACTS_FOUND');
  assert.deepEqual(result.contacts.phones, ['+639171234567']);
  assert.equal(visited.length, 2);
});
test('social websites are recorded without fetching', async () => {
  const result = await scanWebsite('facebook.com/business', { ...common, fetcher: async () => { throw new Error('must not fetch'); } });
  assert.equal(result.status, 'CONTACTS_FOUND'); assert.equal(result.source, 'social');
});
test('distinguishes blocked, dead, empty and network errors', async () => {
  for (const [code, status] of [[403, 'BLOCKED'], [429, 'BLOCKED'], [404, 'DEAD_LINK'], [410, 'DEAD_LINK'], [500, 'ERROR'], [200, 'NOTHING_FOUND']] as const) {
    assert.equal(statusForHttp(code), status);
    const result = await scanWebsite('https://business.ph', { ...common, fetcher: async url => page(url, '<html><body>No contacts.</body></html>', code) });
    assert.equal(result.status, status, String(code)); assert.ok(result.reason);
  }
  assert.equal((await scanWebsite('https://business.ph', { ...common, fetcher: async () => { throw new Error('Request timed out.'); } })).status, 'ERROR');
});
test('stops escalation after contacts, and renderer requires an explicit option', async () => {
  let requests = 0;
  await scanWebsite('https://business.ph', { ...common, fetcher: async url => { requests++; return page(url, 'hello@business.ph'); } });
  assert.equal(requests, 1);
  const html = '<html><body><div id="root"></div><script src="/app.js"></script></body></html>';
  const result = await scanWebsite('https://business.ph', { ...common, rendererUrl: 'https://renderer.test/render', fetcher: async url => page(url, url.includes('renderer.test') ? 'hello@business.ph' : html) });
  assert.equal(result.source, 'renderer'); assert.equal(result.status, 'CONTACTS_FOUND');
});
test('archive rescue labels historical contacts', async () => {
  const result = await scanWebsite('https://business.ph/', { ...common, archive: true, fetcher: async url => {
    if (url.includes('archive.org/wayback/available')) return page(url, JSON.stringify({ archived_snapshots: { closest: { available: true, timestamp: '20250101000000', url: 'https://web.archive.org/web/20250101000000/https://business.ph/' } } }));
    if (url.includes('web.archive.org')) return page(url, 'hello@business.ph');
    return page(url, 'Not found', 404);
  } });
  assert.equal(result.source, 'archive'); assert.match(result.reason, /outdated/);
});
test('stopped scans do not issue requests or return a cacheable failure', async () => {
  const controller = new AbortController(); controller.abort();
  let calls = 0;
  await assert.rejects(() => scanWebsite('https://business.ph', { ...common, signal: controller.signal, fetcher: async url => { calls++; return page(url, 'hello@business.ph'); } }));
  assert.equal(calls, 0);
});
