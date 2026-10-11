import { NextRequest, NextResponse } from 'next/server';
import { resolveArea, LocationError, normalizePlace } from '@/lib/geocoding';
import { queryOverpass } from '@/lib/overpass';
import { mapBusiness } from '@/lib/leads';
import { readDiscoveryCache, withCachedScans, writeDiscoveryCache } from '@/lib/lead-store';
import { containsPoint, isBoundary } from '@/lib/geometry';
import { rejectCrossSite } from '@/lib/api-guard';

export const runtime = 'nodejs';
export const maxDuration = 90;
let searching = false;
export async function POST(request: NextRequest) {
  const rejected = rejectCrossSite(request); if (rejected) return rejected;
  if (searching) return NextResponse.json({ error: 'A map search is already running. Please wait and try again.' }, { status: 429 });
  searching = true;
  try {
    const body: unknown = await request.json();
    if (!body || typeof body !== 'object') return NextResponse.json({ error: 'Invalid search request.' }, { status: 400 });
    const input = body as Record<string, unknown>;
    for (const key of ['searchQuery', 'province', 'city']) if (input[key] !== undefined && (typeof input[key] !== 'string' || String(input[key]).length > 160)) return NextResponse.json({ error: 'Enter a location of up to 160 characters.' }, { status: 400 });
    const limit = typeof input.limit === 'number' ? Math.min(500, Math.max(10, Math.floor(input.limit))) : 100;
    if (!Number.isFinite(limit)) return NextResponse.json({ error: 'Invalid result limit.' }, { status: 400 });
    const location = { searchQuery: input.searchQuery as string | undefined, province: input.province as string | undefined, city: input.city as string | undefined };
    const key = JSON.stringify(['boundary-v2', normalizePlace(location.searchQuery ?? ''), normalizePlace(location.province ?? ''), normalizePlace(location.city ?? ''), limit]);
    const cached = readDiscoveryCache(key);
    let area = cached?.area;
    if (!area || !isBoundary(area.boundary)) area = await resolveArea(location);
    let partial = false;
    const leads = cached && isBoundary(cached.area.boundary)
      ? cached.leads.filter(lead => lead.longitude !== undefined && lead.latitude !== undefined && containsPoint(area.boundary, lead.longitude, lead.latitude))
      : (await queryOverpass(area, limit, { signal: request.signal, onPartial: () => { partial = true; } })).map(element => mapBusiness(element, area.name));
    if (!cached && !partial) writeDiscoveryCache(key, area, leads);
    const warning = partial ? 'A map service stopped responding before the search finished. Showing the businesses found so far; try again for more.' : undefined;
    return NextResponse.json({ leads: withCachedScans(leads), warning, matchedArea: { id: area.id, name: area.name }, cached: Boolean(cached), message: leads.length ? undefined : 'No mapped businesses found inside this boundary.' });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Search failed.' }, { status: error instanceof LocationError ? 422 : error instanceof SyntaxError ? 400 : 500 });
  } finally { searching = false; }
}
