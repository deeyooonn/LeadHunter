import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizePlace, selectArea } from '../lib/geocoding';
import { containsPoint, type Boundary } from '../lib/geometry';
import { buildOverpassQuery, withinArea } from '../lib/overpass';
import caviteFixture from './fixtures/cavite-boundary.json';
import { isBoundary } from '../lib/geometry';

const polygon: Boundary = { type: 'Polygon', coordinates: [[[120, 14], [121, 14], [121, 14.5], [120, 14.5], [120, 14]]] };
const candidate = (name: string, id: number, kind = 'state') => ({ name, display_name: `${name}, Philippines`, class: 'boundary', type: 'administrative', addresstype: kind, osm_type: 'relation', osm_id: id, address: { country_code: 'ph' }, geojson: polygon });
test('Cavite selects exact province even when the first result is Quezon City', () => {
  const area = selectArea([candidate('Quezon City', 1, 'city'), candidate('Cavite City', 2, 'city'), candidate('Cavite', 3)], { searchQuery: 'Cavite' });
  assert.equal(area.id, 'relation/3');
  assert.equal(containsPoint(area.boundary, 120.9, 14.3), true);
  assert.equal(containsPoint(area.boundary, 121.0437, 14.676), false);
});
test('Quezon and Quezon City resolve separately', () => {
  const candidates = [candidate('Quezon City', 1, 'city'), candidate('Quezon', 2)];
  assert.equal(selectArea(candidates, { searchQuery: 'Quezon' }).id, 'relation/2');
  assert.equal(selectArea(candidates, { searchQuery: 'Quezon City' }).id, 'relation/1');
});
test('explicit City of and Province of names keep their administrative intent', () => {
  const candidates = [candidate('Cavite', 1), candidate('Cavite City', 2, 'city')];
  assert.equal(selectArea(candidates, { searchQuery: 'City of Cavite' }).id, 'relation/2');
  assert.equal(selectArea(candidates, { searchQuery: 'Province of Cavite' }).id, 'relation/1');
});
test('rejects nonsense, wrong country, points, non-boundaries, and ambiguous names', () => {
  assert.throws(() => selectArea([candidate('Cavite', 1)], { searchQuery: 'madeupplace' }));
  for (const override of [{ address: { country_code: 'us' } }, { geojson: { type: 'Point', coordinates: [121, 14] } }, { class: 'shop' }]) assert.throws(() => selectArea([{ ...candidate('Cavite', 1), ...override }], { searchQuery: 'Cavite' }));
  assert.throws(() => selectArea([candidate('San Juan', 1, 'city'), candidate('San Juan', 2, 'city')], { searchQuery: 'San Juan' }));
  assert.throws(() => selectArea([], { searchQuery: 'Cavite' }));
});
test('normalizes names and verifies parent province', () => {
  assert.equal(normalizePlace('Province of CAVITE'), 'cavite');
  assert.equal(normalizePlace('Dasmariñas'), 'dasmarinas');
  const city = { ...candidate('Dasmariñas', 1, 'city'), address: { country_code: 'ph', state: 'Cavite' } };
  assert.equal(selectArea([city], { province: 'Cavite', city: 'Dasmarinas City' }).id, 'relation/1');
  assert.throws(() => selectArea([city], { province: 'Quezon', city: 'Dasmarinas City' }));
});
test('multipolygons and holes exclude outside points', () => {
  const shape: Boundary = { type: 'MultiPolygon', coordinates: [[[[0,0],[4,0],[4,4],[0,4],[0,0]], [[1,1],[2,1],[2,2],[1,2],[1,1]]], [[[6,6],[7,6],[7,7],[6,7],[6,6]]]] };
  assert.equal(containsPoint(shape, 1.5, 1.5), false);
  assert.equal(containsPoint(shape, 3, 3), true);
  assert.equal(containsPoint(shape, 6.5, 6.5), true);
  assert.equal(containsPoint(shape, 5, 5), false);
});
test('Overpass includes named relations and filters returned coordinates again', () => {
  const area = selectArea([candidate('Cavite', 3)], { searchQuery: 'Cavite' });
  const query = buildOverpassQuery(area, 100);
  assert.match(query, /nwr\(14,120,14.5,121\)->\.nearby/);
  assert.match(query, /nwr\.nearby\["name"\]/);
  for (const tag of ['shop', 'craft', 'office', 'healthcare', 'tourism', 'leisure']) assert.ok(query.includes(tag));
  const filtered = withinArea([
    { type: 'node', id: 1, lat: 14.3, lon: 120.9, tags: { name: 'Inside' } },
    { type: 'node', id: 2, lat: 14.676, lon: 121.0437, tags: { name: 'Quezon City' } },
    { type: 'way', id: 3, tags: { name: 'Missing coordinates' } },
  ], area);
  assert.deepEqual(filtered.map(e => e.id), [1]);
});
test('real Cavite polygon excludes Quezon City and adjacent provinces', () => {
  const boundary = caviteFixture.boundary;
  assert.ok(isBoundary(boundary));
  assert.equal(containsPoint(boundary, 120.9367, 14.4297), true, 'Imus');
  assert.equal(containsPoint(boundary, 120.9407, 14.3294), true, 'Dasmariñas');
  assert.equal(containsPoint(boundary, 121.0437, 14.676), false, 'Quezon City');
  assert.equal(containsPoint(boundary, 121.1653, 14.2136), false, 'Calamba');
  assert.equal(containsPoint(boundary, 121.0583, 14.0583), false, 'Tanauan');
});
