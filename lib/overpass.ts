import { APP_AGENT, type ResolvedArea } from './geocoding';
import { containsPoint } from './geometry';
import { safeFetch } from './safe-fetch';

export interface OsmElement {
  type: 'node' | 'way' | 'relation'; id: number;
  lat?: number; lon?: number; center?: { lat: number; lon: number };
  tags?: Record<string, string | undefined>;
}
export function businessCategory(tags: Record<string, string | undefined>): string {
  return (tags.shop ?? tags.craft ?? tags.healthcare ?? tags.amenity ?? tags.tourism ?? tags.leisure ?? tags.office ?? 'Local business').replaceAll('_', ' ');
}
export function buildOverpassQuery(area: ResolvedArea, limit: number): string {
  const [south, north, west, east] = area.bbox;
  const filters = [
    '["shop"]["shop"!~"^(vacant|no|closed)$"]', '["craft"]["craft"!="no"]',
    '["office"]["office"!~"^(government|administrative|diplomatic|political_party|religion|association|ngo|charity|educational_institution|research|quango|yes)$"]',
    '["amenity"~"^(restaurant|cafe|fast_food|food_court|bar|pub|ice_cream|clinic|doctors|dentist|pharmacy|veterinary|hospital|car_wash|spa|bank|bureau_de_change)$"]',
    '["healthcare"~"^(clinic|doctor|dentist|physiotherapist|alternative|laboratory|optometrist|podiatrist|psychotherapist|rehabilitation)$"]',
    '["tourism"~"^(hotel|motel|hostel|guest_house|resort|apartment|chalet|camp_site)$"]',
    '["leisure"~"^(fitness_centre|fitness_station|sports_centre|sauna|tanning_salon)$"]',
  ];
  // Materialize the spatial set first. Global name/negative-tag filters can
  // exhaust the public service's query budget even for a small city.
  return `[out:json][timeout:15][maxsize:134217728];\nnwr(${south},${west},${north},${east})->.nearby;\n(\n${filters.map(filter => `nwr.nearby["name"]${filter}["office"!~"^(government|administrative|diplomatic|political_party|religion|association|ngo|charity|educational_institution|research|quango)$"]["operator:type"!="government"];`).join('\n')}\n);\nout center ${Math.min(1500, limit * 3)};`;
}
export function withinArea(elements: OsmElement[], area: ResolvedArea): OsmElement[] {
  return elements.filter(element => {
    const lat = element.lat ?? element.center?.lat, lon = element.lon ?? element.center?.lon;
    return element.tags?.name?.trim() && lat !== undefined && lon !== undefined && containsPoint(area.boundary, lon, lat);
  });
}
export function searchTiles(area: ResolvedArea): ResolvedArea['bbox'][] {
  const [south, north, west, east] = area.bbox;
  const rows = Math.max(1, Math.ceil((north - south) / 0.12));
  const columns = Math.max(1, Math.ceil((east - west) / 0.12));
  const tiles: { bbox: ResolvedArea['bbox']; distance: number }[] = [];
  for (let row = 0; row < rows; row++) for (let column = 0; column < columns; column++) {
    tiles.push({ bbox: [south + (north - south) * row / rows, south + (north - south) * (row + 1) / rows, west + (east - west) * column / columns, west + (east - west) * (column + 1) / columns], distance: (row - (rows - 1) / 2) ** 2 + (column - (columns - 1) / 2) ** 2 });
  }
  return tiles.sort((a, b) => a.distance - b.distance).map(tile => tile.bbox);
}
export async function queryOverpass(area: ResolvedArea, limit: number, options: { fetcher?: typeof safeFetch; signal?: AbortSignal; onPartial?: () => void } = {}): Promise<OsmElement[]> {
  const fetcher = options.fetcher ?? safeFetch;
  const deadline = Date.now() + 50000;
  const signal = AbortSignal.any([AbortSignal.timeout(50000), ...(options.signal ? [options.signal] : [])]);
  const found = new Map<string, OsmElement>();
  let failure = '';
  for (const bbox of searchTiles(area)) {
    options.signal?.throwIfAborted();
    if (signal.aborted || Date.now() >= deadline) { failure ||= 'Search time budget reached'; break; }
    const query = buildOverpassQuery({ ...area, bbox }, limit);
    let completed = false;
    for (const mirror of ['https://overpass-api.de/api/interpreter', 'https://overpass.private.coffee/api/interpreter']) {
      if (signal.aborted) break;
      try {
        const response = await fetcher(mirror, { method: 'POST', body: `data=${encodeURIComponent(query)}`, signal, timeoutMs: Math.min(20000, Math.max(1, deadline - Date.now())), maxBytes: 8_000_000, headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': APP_AGENT } });
        if (response.status !== 200) { failure = `HTTP ${response.status}`; continue; }
        const data = JSON.parse(response.text) as { elements?: OsmElement[]; remark?: string };
        if (data.remark || !Array.isArray(data.elements)) { failure = data.remark?.slice(0, 200) ?? 'Invalid map response'; continue; }
        for (const element of withinArea(data.elements, area)) found.set(`${element.type}/${element.id}`, element);
        failure = '';
        completed = true;
        break;
      } catch (error) { options.signal?.throwIfAborted(); failure = error instanceof Error ? error.message : 'Network error'; }
    }
    if (found.size >= limit) return [...found.values()].slice(0, limit);
    // Do not spend another full retry cycle on every tile during an outage.
    if (!completed) break;
  }
  if (found.size && failure) options.onPartial?.();
  if (found.size || !failure) return [...found.values()].slice(0, limit);
  throw new Error(`Map services could not complete this search (${failure}). Try again later or select a smaller city or municipality.`);
}
