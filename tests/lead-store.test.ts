import test from 'node:test';
import assert from 'node:assert/strict';
import { readScan, saveScan, withCachedScans } from '../lib/lead-store';
import { mapBusiness } from '../lib/leads';
import type { ScanResult } from '../types/lead';

const scan: ScanResult = { status: 'CONTACTS_FOUND', reason: 'Public contacts found.', source: 'website', scannedAt: '2026-10-11T00:00:00Z', pages: ['https://business.ph/'], contacts: { phones: [], emails: ['hello@business.ph'], socials: [] } };

test('scan cache normalizes URLs, isolates values and retains contacts after a failed rescan', () => {
  const saved = saveScan('business.ph', scan);
  saved.contacts.emails.push('changed@business.ph');
  assert.deepEqual(readScan('https://business.ph/')?.contacts.emails, ['hello@business.ph']);
  const failed = saveScan('https://business.ph/', { ...scan, status: 'ERROR', reason: 'Timed out', contacts: { phones: [], emails: [], socials: [] } });
  assert.deepEqual(failed.contacts.emails, ['hello@business.ph']);
  assert.equal(failed.status, 'ERROR');
});

test('rediscovery restores scans by website while preserving map contacts and ignoring changed websites', () => {
  saveScan('https://restore.ph/', scan);
  const lead = mapBusiness({ type: 'node', id: 1, lat: 14.4, lon: 120.9, tags: { name: 'Business', website: 'https://restore.ph/', phone: '09171234567' } }, 'Cavite');
  const [restored] = withCachedScans([lead]);
  assert.equal(restored.scan_status, 'CONTACTS_FOUND');
  assert.deepEqual(restored.scraped_contacts?.emails, ['hello@business.ph']);
  assert.deepEqual(restored.osm_contacts?.phones, ['+639171234567']);
  assert.equal(lead.scan_status, 'NOT_SCANNED');
  assert.equal(withCachedScans([{ ...lead, website_url: 'https://different.ph/' }])[0].scan_status, 'NOT_SCANNED');
});

test('scan cache has a bounded capacity', () => {
  for (let i = 0; i <= 500; i++) saveScan(`https://capacity.ph/${i}`, scan);
  assert.equal(readScan('https://capacity.ph/0'), null);
  assert.ok(readScan('https://capacity.ph/500'));
});
