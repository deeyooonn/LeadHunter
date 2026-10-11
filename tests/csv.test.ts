import test from 'node:test';
import assert from 'node:assert/strict';
import { csvCell, leadsCsv } from '../lib/csv';
import { mapBusiness } from '../lib/leads';
test('CSV neutralizes formulas, preserves phone text, and escapes quotes', () => {
  assert.equal(csvCell('=HYPERLINK("bad")'), '"\'=HYPERLINK(""bad"")"');
  assert.equal(csvCell('\t@SUM(1)'), '"\'\t@SUM(1)"');
  assert.equal(csvCell('09171234567', true), '"\'09171234567"');
  const lead = mapBusiness({ type: 'node', id: 1, lat: 14.3, lon: 120.9, tags: { name: 'Local "Business"', phone: '09171234567', email: 'hello@business.ph' } }, 'Cavite');
  const csv = leadsCsv([lead]);
  assert.ok(csv.startsWith('\uFEFF')); assert.ok(csv.includes('Local ""Business""')); assert.ok(csv.includes("'+639171234567")); assert.ok(csv.includes('hello@business.ph'));
});
