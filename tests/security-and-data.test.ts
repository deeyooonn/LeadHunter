import test from 'node:test';
import assert from 'node:assert/strict';
import { isPublicAddress, normalizeUrl, safeFetch, validatePublicUrl } from '../lib/safe-fetch';
import { mapBusiness } from '../lib/leads';

test('blocks private/reserved IPv4, IPv6 and alternate numeric forms', async () => {
  for (const ip of ['127.0.0.1', '10.0.0.1', '172.16.0.1', '192.168.1.1', '169.254.169.254', '100.64.0.1', '0.0.0.0', '::1', 'fc00::1', 'fe80::1', '::ffff:127.0.0.1', '224.0.0.1']) assert.equal(isPublicAddress(ip), false, ip);
  for (const url of ['http://2130706433', 'http://0x7f000001', 'http://[::ffff:127.0.0.1]', 'http://localhost', 'http://169.254.169.254/latest/meta-data']) await assert.rejects(() => safeFetch(url));
  assert.equal(isPublicAddress('8.8.8.8'), true);
  assert.throws(() => normalizeUrl('file:///etc/passwd'));
  assert.throws(() => normalizeUrl('http://user:password@example.com'));
  assert.throws(() => normalizeUrl('http://example.com:8080'));
});
test('rejects mixed public/private DNS answers', async () => {
  const resolver = async () => [{ address: '8.8.8.8', family: 4 }, { address: '127.0.0.1', family: 4 }];
  await assert.rejects(() => validatePublicUrl('https://business.ph', resolver));
});
test('discovery keeps map contacts separate from scraped contacts', () => {
  const lead = mapBusiness({ type: 'node', id: 1, lat: 14.3, lon: 120.9, tags: { name: 'Business', 'contact:phone': '09171234567', email: 'hello@business.ph' } }, 'Cavite');
  assert.deepEqual(lead.osm_contacts?.phones, ['+639171234567']);
  assert.deepEqual(lead.osm_contacts?.emails, ['hello@business.ph']);
  assert.deepEqual(lead.scraped_contacts, { phones: [], emails: [], socials: [] });
  assert.equal(lead.scan_status, 'NOT_SCANNED');
});
