import { readFile } from 'node:fs/promises';
import { buildOverpassQuery } from '../lib/overpass';
import { safeFetch } from '../lib/safe-fetch';
import { APP_AGENT, type ResolvedArea } from '../lib/geocoding';
async function main() {
  const cache = JSON.parse(await readFile('artifacts/resolved-areas.json', 'utf8')) as { cavite: ResolvedArea };
  const query = buildOverpassQuery(cache.cavite, 20);
  const response = await safeFetch('https://overpass-api.de/api/interpreter', { method: 'POST', body: `data=${encodeURIComponent(query)}`, timeoutMs: 30000, maxBytes: 8_000_000, headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': APP_AGENT } });
  console.log(JSON.stringify({ status: response.status, body: response.text.slice(0, 2000) }));
}
main().catch(error => { console.error(error instanceof Error ? error.message : 'Request failed'); process.exitCode = 1; });
