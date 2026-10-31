import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createDemoLeads } from '../lib/demo.ts';
test('demo searches return synthetic leads for the selected area without real contact details', () => {
  const leads=createDemoLeads({province:'Bulacan',city:'Bustos',businessType:'cafes'});
  assert.equal(leads.length,6);
  assert.ok(leads.every(lead=>lead.address.includes('Bustos') && lead.phone === null && lead.id.startsWith('demo-')));
  assert.equal(leads[0].website_status,'NO_WEBSITE');
  assert.equal(leads[2].website_status,'CUSTOM_WEBSITE');
  assert.ok(leads[2].website_url.startsWith('https://example.com/'));
});
