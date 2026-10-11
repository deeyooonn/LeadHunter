import { boundaryBox, isBoundary, type Boundary } from './geometry';
import { safeFetch } from './safe-fetch';

export interface ResolvedArea {
  id: string;
  name: string;
  boundary: Boundary;
  bbox: [number, number, number, number];
  areaId?: number;
}
export interface LocationInput { searchQuery?: string; province?: string; city?: string }
export class LocationError extends Error {}
export const APP_AGENT = 'LeadHunter/2.0 (+https://github.com/deeyooonn/Client-Scrapper)';

export function normalizePlace(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    .replace(/\([^)]{0,100}\)/g, '').replace(/^(province|city|municipality)\s+of\s+/, '')
    .replace(/\s+province$/, '').replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
}
const record = (v: unknown): Record<string, unknown> => v !== null && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, unknown> : {};
const clean = (s: string) => s.replace(/\s*\([^)]{0,100}\)\s*/g, ' ').trim();
function target(input: LocationInput) {
  const province = clean(input.province ?? '');
  const city = input.city && !input.city.startsWith('All ') ? clean(input.city) : '';
  const parts = (input.searchQuery?.trim() || [city, province].filter(Boolean).join(', ')).split(',').map(clean).filter(Boolean);
  if (!parts.length || parts[0].length > 160) throw new LocationError('Enter a Philippine province, city, or municipality.');
  return { query: [...parts.filter(p => normalizePlace(p) !== 'philippines'), 'Philippines'].join(', '), name: normalizePlace(parts[0]), parent: normalizePlace(parts[1] ?? ''), provinceOnly: (!input.searchQuery && !city && Boolean(province)) || /^(?:province of)\b|\bprovince$/i.test(parts[0]), cityOnly: Boolean(city) || /^city of\b|\bcity$/i.test(parts[0]) };
}

export function selectArea(results: unknown, input: LocationInput): ResolvedArea {
  const request = target(input);
  if (!Array.isArray(results)) throw new LocationError('The location service returned an invalid response.');
  const candidates = results.flatMap((item: unknown) => {
    const r = record(item), address = record(r.address), names = record(r.namedetails);
    if (address.country_code !== 'ph' || !isBoundary(r.geojson)) return [];
    if (!(r.class === 'boundary' && r.type === 'administrative') && !(r.class === 'place' && ['state', 'province', 'city', 'town', 'municipality', 'village', 'county', 'region'].includes(String(r.type)))) return [];
    const kind = String(r.addresstype ?? r.type);
    const isProvince = ['state', 'province'].includes(kind);
    if (request.provinceOnly && !isProvince && request.name !== 'metro manila') return [];
    if (request.cityOnly && !['city', 'town', 'municipality'].includes(kind)) return [];
    const aliases = [r.name, ...Object.values(names), String(r.display_name ?? '').split(',')[0]].filter((n): n is string => typeof n === 'string').map(normalizePlace);
    let exact = aliases.includes(request.name);
    // City suffixes differ between OSM and our dropdowns. Do not strip them for provinces.
    if (!exact && request.cityOnly && !isProvince) exact = aliases.some(alias => alias.replace(/ city$/, '') === request.name.replace(/ city$/, ''));
    if (!exact) return [];
    if (request.parent && request.parent !== 'philippines') {
      const parents = Object.values(address).filter((v): v is string => typeof v === 'string').map(normalizePlace);
      if (!parents.includes(request.parent)) return [];
    }
    if (!['relation', 'way'].includes(String(r.osm_type)) || !Number.isSafeInteger(r.osm_id) || Number(r.osm_id) <= 0) return [];
    const area: ResolvedArea = {
      id: `${r.osm_type}/${r.osm_id}`, name: String(r.display_name), boundary: r.geojson, bbox: boundaryBox(r.geojson),
      ...(r.osm_type === 'relation' ? { areaId: 3600000000 + Number(r.osm_id) } : {}),
    };
    return [{ area, score: (isProvince ? 20 : ['city', 'town', 'municipality'].includes(kind) ? 10 : 0) }];
  }).sort((a, b) => b.score - a.score);
  if (!candidates.length) throw new LocationError('No matching Philippine boundary found. Enter a province or a city with its province; no default location was used.');
  if (candidates[1]?.score === candidates[0].score && candidates[1].area.id !== candidates[0].area.id) throw new LocationError('This place name is ambiguous. Include its province or municipality.');
  return candidates[0].area;
}

let queue = Promise.resolve();
let lastRequest = 0;
export async function resolveArea(input: LocationInput): Promise<ResolvedArea> {
  const request = target(input);
  const previous = queue;
  let release = () => {};
  queue = new Promise<void>(resolve => { release = resolve; });
  await previous;
  try {
    await new Promise(resolve => setTimeout(resolve, Math.max(0, 1100 - (Date.now() - lastRequest))));
    lastRequest = Date.now();
    const url = new URL(process.env.NOMINATIM_URL ?? 'https://nominatim.openstreetmap.org/search');
    for (const [key, value] of Object.entries({ q: request.query, format: 'json', countrycodes: 'ph', limit: '10', addressdetails: '1', namedetails: '1', polygon_geojson: '1' })) url.searchParams.set(key, value);
    const response = await safeFetch(url.href, { timeoutMs: 20000, maxBytes: 12_000_000, headers: { 'User-Agent': APP_AGENT, 'Accept-Language': 'en' } });
    if (response.status !== 200) throw new LocationError(`Location service unavailable (${response.status}). Please try again; no default location was used.`);
    return selectArea(JSON.parse(response.text) as unknown, input);
  } finally { release(); }
}
