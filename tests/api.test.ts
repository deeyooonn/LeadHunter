import test from 'node:test';
import assert from 'node:assert/strict';
import { NextRequest } from 'next/server';
import { POST as discover } from '../app/api/discover/route';
import { POST as enrich } from '../app/api/enrich/route';
import { writeDiscoveryCache } from '../lib/lead-store';
import { mapBusiness } from '../lib/leads';
import type { ResolvedArea } from '../lib/geocoding';
const request = (path: string, body: unknown, headers: Record<string, string> = {}) => new NextRequest(`http://localhost:3000/api/${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body) });
test('API rejects private scan destinations and reuses temporary scans without storage warnings', async () => {
  const response = await enrich(request('enrich', { lead_id: 'osm_node_1', website_url: 'http://127.0.0.1/' }));
  assert.equal(response.status, 200);
  const data: unknown = await response.json();
  assert.ok(data && typeof data === 'object' && 'scan' in data);
  assert.equal((data.scan as { status: string }).status, 'BLOCKED');
  assert.equal('warning' in data, false);
  const cached = await enrich(request('enrich', { lead_id: 'osm_node_1', website_url: 'http://127.0.0.1/' }));
  assert.equal((await cached.json()).cached, true);
  const forced = await enrich(request('enrich', { lead_id: 'osm_node_1', website_url: 'http://127.0.0.1/', force: true }));
  assert.equal((await forced.json()).cached, false);
});
test('empty/invalid location requests never fall back and cross-site scans are rejected', async () => {
  assert.equal((await discover(request('discover', { searchQuery: '' }))).status, 422);
  assert.equal((await discover(request('discover', { searchQuery: 123 }))).status, 400);
  assert.equal((await enrich(request('enrich', { lead_id: 'osm_node_1', website_url: 'https://example.com' }, { 'sec-fetch-site': 'cross-site' }))).status, 403);
});
test('discovery returns cached leads without a database warning', async () => {
  const area: ResolvedArea = { id: 'relation/1', name: 'Test city', bbox: [14, 15, 120, 121], boundary: { type: 'Polygon', coordinates: [[[120, 14], [121, 14], [121, 15], [120, 15], [120, 14]]] } };
  const lead = mapBusiness({ type: 'node', id: 3, lat: 14.5, lon: 120.5, tags: { name: 'Test business' } }, area.name);
  writeDiscoveryCache(JSON.stringify(['boundary-v2', 'test city', '', '', 100]), area, [lead]);
  const response = await discover(request('discover', { searchQuery: 'Test city', limit: 100 }));
  assert.equal(response.status, 200);
  const data = await response.json();
  assert.equal(data.leads.length, 1);
  assert.equal(data.cached, true);
  assert.equal('warning' in data, false);
});
