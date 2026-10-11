import assert from 'node:assert/strict';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { resolveArea, type ResolvedArea } from '../lib/geocoding';
import { containsPoint } from '../lib/geometry';
import { queryOverpass } from '../lib/overpass';

async function main() {
  let cache: { savedAt: number; cavite: ResolvedArea; qc: ResolvedArea; quezon: ResolvedArea } | undefined;
  try { cache = JSON.parse(await readFile('artifacts/resolved-areas.json', 'utf8')); } catch { /* First live check. */ }
  if (!cache || Date.now() - cache.savedAt > 7 * 86400000) {
    cache = { savedAt: Date.now(), cavite: await resolveArea({ searchQuery: 'Cavite' }), qc: await resolveArea({ searchQuery: 'Quezon City' }), quezon: await resolveArea({ searchQuery: 'Quezon' }) };
    await mkdir('artifacts', { recursive: true });
    await writeFile('artifacts/resolved-areas.json', JSON.stringify(cache));
  }
  const { cavite, qc, quezon } = cache;
  assert.notEqual(qc.id, quezon.id);
  assert.equal(containsPoint(cavite.boundary, 121.0437, 14.676), false);
  await mkdir('tests/fixtures', { recursive: true });
  await writeFile('tests/fixtures/cavite-boundary.json', JSON.stringify({ attribution: '© OpenStreetMap contributors, ODbL. Retrieved from Nominatim for boundary regression tests.', id: cavite.id, name: cavite.name, boundary: cavite.boundary }));
  console.log(JSON.stringify({ cavite: cavite.name, caviteId: cavite.id, qc: qc.id, quezon: quezon.id, quezonCityPointExcluded: true }));
  const businesses = await queryOverpass(cavite, 20);
  assert.ok(businesses.length > 0, 'No businesses returned; cannot verify live discovery.');
  for (const business of businesses) {
    const lat = business.lat ?? business.center?.lat;
    const lon = business.lon ?? business.center?.lon;
    assert.ok(lat !== undefined && lon !== undefined && containsPoint(cavite.boundary, lon, lat));
    assert.equal(containsPoint(qc.boundary, lon!, lat!), false);
  }
  const report = { checkedAt: new Date().toISOString(), cavite: { id: cavite.id, name: cavite.name }, quezonCity: { id: qc.id, name: qc.name }, quezon: { id: quezon.id, name: quezon.name }, allBusinessesInsideCavite: true, noBusinessesInsideQuezonCity: true, businesses: businesses.map(b => ({ id: `${b.type}/${b.id}`, name: b.tags?.name, lat: b.lat ?? b.center?.lat, lon: b.lon ?? b.center?.lon })) };
  await mkdir('artifacts', { recursive: true });
  await writeFile('artifacts/location-verification.json', JSON.stringify(report, null, 2) + '\n');
  await mkdir('tests/fixtures', { recursive: true });
  await writeFile('tests/fixtures/cavite-boundary.json', JSON.stringify({ attribution: '© OpenStreetMap contributors, ODbL. Retrieved from Nominatim for boundary regression tests.', id: cavite.id, name: cavite.name, boundary: cavite.boundary }));
  console.log(JSON.stringify(report, null, 2));
}
main().catch(error => { console.error(error instanceof Error ? error.message : 'Live location verification failed.'); process.exitCode = 1; });
