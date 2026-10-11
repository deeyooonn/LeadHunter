import test from 'node:test';
import assert from 'node:assert/strict';
import type { ResolvedArea } from '../lib/geocoding';
import { queryOverpass, searchTiles, type OsmElement } from '../lib/overpass';
import { readDiscoveryCache, writeDiscoveryCache } from '../lib/lead-store';
import type { SafeResponse } from '../lib/safe-fetch';

const area: ResolvedArea = {
  id: 'relation/1', name: 'Test city', bbox: [14, 14.1, 120, 120.1],
  boundary: { type: 'Polygon', coordinates: [[[120, 14], [120.1, 14], [120.1, 14.1], [120, 14.1], [120, 14]]] },
};
const inside: OsmElement = { type: 'node', id: 1, lat: 14.05, lon: 120.05, tags: { name: 'Business', shop: 'bakery' } };
const response = (url: string, elements: OsmElement[], remark?: string): SafeResponse => ({ url, status: 200, headers: {}, text: JSON.stringify({ elements, remark }) });

test('province tiles cover the requested extent with bounded size', () => {
  const bbox: ResolvedArea['bbox'] = [14, 14.5, 120, 120.7];
  const tiles = searchTiles({ ...area, bbox });
  assert.equal(tiles.length, 30);
  let surface = 0;
  for (const [s, n, w, e] of tiles) {
    assert.ok(s >= bbox[0] && n <= bbox[1] && w >= bbox[2] && e <= bbox[3]);
    assert.ok(n - s <= 0.120001 && e - w <= 0.120001);
    surface += (n - s) * (e - w);
  }
  assert.ok(Math.abs(surface - (bbox[1] - bbox[0]) * (bbox[3] - bbox[2])) < 1e-9);
  assert.deepEqual(searchTiles(area), [area.bbox]);
});

test('timeout falls back to the other provider and rejects out-of-boundary rows', async () => {
  const calls: string[] = [];
  const rows = await queryOverpass(area, 10, { fetcher: async url => {
    calls.push(url);
    if (calls.length === 1) throw new Error('Request timed out.');
    return response(url, [inside, { ...inside, id: 2, lon: 121 }]);
  } });
  assert.deepEqual(rows, [inside]);
  assert.equal(new Set(calls).size, 2);
});

test('a runtime error inside HTTP 200 is retried, and a recovered empty search is valid', async () => {
  let calls = 0;
  const rows = await queryOverpass(area, 10, { fetcher: async url => ++calls === 1
    ? response(url, [inside], 'runtime error: Query timed out') : response(url, []) });
  assert.deepEqual(rows, []);
  assert.equal(calls, 2);
});

test('tile results are deduplicated and stop as soon as the result limit is met', async () => {
  let calls = 0;
  const rows = await queryOverpass({ ...area, bbox: [14, 14.3, 120, 120.3] }, 2, { fetcher: async url => {
    calls++;
    return response(url, calls === 1 ? [inside] : [inside, { ...inside, type: 'way' }]);
  } });
  assert.equal(rows.length, 2);
  assert.equal(calls, 2);
});

test('provider outage fails without retrying every province tile', async () => {
  let calls = 0;
  await assert.rejects(() => queryOverpass({ ...area, bbox: [14, 15, 120, 121] }, 10, { fetcher: async () => {
    calls++; throw new Error('Request timed out.');
  } }), /Map services could not complete/);
  assert.equal(calls, 2);
});

test('cancelled searches do not contact providers', async () => {
  const controller = new AbortController(); controller.abort();
  let calls = 0;
  await assert.rejects(() => queryOverpass(area, 10, { signal: controller.signal, fetcher: async url => {
    calls++; return response(url, []);
  } }));
  assert.equal(calls, 0);
});

test('an outage after successful tiles preserves contacts and marks the search partial', async () => {
  let calls = 0, partial = false;
  const rows = await queryOverpass({ ...area, bbox: [14, 14.3, 120, 120.3] }, 10, {
    onPartial: () => { partial = true; },
    fetcher: async url => { if (++calls > 1) throw new Error('Request timed out.'); return response(url, [inside]); },
  });
  assert.deepEqual(rows, [inside]);
  assert.equal(partial, true);
});

test('temporary discovery cache works without a database, isolates values, and expires', async context => {
  const now = Date.now();
  await writeDiscoveryCache('temporary-cache-test', area, []);
  const first = await readDiscoveryCache('temporary-cache-test');
  assert.ok(first);
  first.area.name = 'Changed by caller';
  assert.equal((await readDiscoveryCache('temporary-cache-test'))?.area.name, 'Test city');
  context.mock.method(Date, 'now', () => now + 11 * 60000);
  assert.equal(await readDiscoveryCache('temporary-cache-test'), null);
});
