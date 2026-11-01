import { NextRequest, NextResponse } from 'next/server';
import type { Lead, LeadInsert, WebsiteStatus, DiscoverRequest } from '@/types/lead';

// ─── Nominatim Types ──────────────────────────────────────────────────────────

interface NominatimResult {
  boundingbox: [string, string, string, string]; // [south, north, west, east]
  display_name: string;
  lat: string;
  lon: string;
  osm_type?: string;
  osm_id?: number;
}

// ─── Overpass API Types ───────────────────────────────────────────────────────

interface OsmElement {
  type: 'node' | 'way' | 'relation';
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: {
    name?: string;
    'addr:street'?: string;
    'addr:housenumber'?: string;
    'addr:city'?: string;
    'addr:state'?: string;
    'addr:country'?: string;
    'addr:postcode'?: string;
    phone?: string;
    'contact:phone'?: string;
    website?: string;
    'contact:website'?: string;
    amenity?: string;
    shop?: string;
    [key: string]: string | undefined;
  };
}

interface OverpassResponse {
  elements: OsmElement[];
}

// Public Overpass API servers for automatic failover/load balancing
const OVERPASS_MIRRORS = [
  'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
];

// ─── Bulacan fallback bounding box ───────────────────────────────────────────
// [south, north, west, east]
const BULACAN_BBOX: [number, number, number, number] = [14.6500, 15.2000, 120.6500, 121.2000];

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Classify website_status based on the URL string.
 */
function determineWebsiteStatus(url?: string | null): WebsiteStatus {
  if (!url || url.trim() === '') return 'NO_WEBSITE';
  const lower = url.toLowerCase();
  if (lower.includes('facebook.com') || lower.includes('fb.com')) return 'FB_ONLY';
  return 'CUSTOM_WEBSITE';
}

/**
 * Build a human-readable address from OSM addr:* tags.
 * Falls back to a placeholder including the city/area name.
 */
function buildAddress(tags: OsmElement['tags'], fallbackArea: string): string {
  if (!tags) return fallbackArea;

  const parts: string[] = [];

  const housenumber = tags['addr:housenumber'];
  const street = tags['addr:street'];
  const city = tags['addr:city'];
  const state = tags['addr:state'];
  const postcode = tags['addr:postcode'];
  const country = tags['addr:country'];

  if (housenumber && street) {
    parts.push(`${housenumber} ${street}`);
  } else if (street) {
    parts.push(street);
  }

  if (city) parts.push(city);
  if (state) parts.push(state);
  if (postcode) parts.push(postcode);
  if (country) parts.push(country);

  return parts.length > 0 ? parts.join(', ') : fallbackArea;
}

// ─── Step 1: Geocode via Nominatim ────────────────────────────────────────────

async function geocodeQuery(
  searchQuery: string
): Promise<{ bbox: [number, number, number, number]; displayName: string; areaId?: number }> {
  const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(searchQuery)}&format=json&limit=1`;

  console.log(`[discover] Nominatim geocoding: "${searchQuery}"`);

  const response = await fetch(url, {
    headers: {
      'User-Agent': 'LeadHunter/1.0 (local-lead-generation-tool)',
      'Accept-Language': 'en',
    },
    signal: AbortSignal.timeout(8000),
  });

  if (!response.ok) {
    console.warn(`[discover] Nominatim returned ${response.status} — falling back to Bulacan bbox`);
    return { bbox: BULACAN_BBOX, displayName: 'Bulacan, Philippines', areaId: 3601504656 };
  }

  const results = (await response.json()) as NominatimResult[];

  if (!results || results.length === 0) {
    console.warn(`[discover] Nominatim: no results for "${searchQuery}" — falling back to Bulacan bbox`);
    return { bbox: BULACAN_BBOX, displayName: 'Bulacan, Philippines', areaId: 3601504656 };
  }

  const first = results[0];
  const [south, north, west, east] = first.boundingbox.map(Number) as [number, number, number, number];

  // In OpenStreetMap, relation areas are offset by 3,600,000,000 and ways by 2,400,000,000
  let areaId: number | undefined;
  if (first.osm_type === 'relation' && first.osm_id) {
    areaId = 3600000000 + Number(first.osm_id);
  } else if (first.osm_type === 'way' && first.osm_id) {
    areaId = 2400000000 + Number(first.osm_id);
  }

  console.log(
    `[discover] Nominatim resolved: "${first.display_name}" areaId=${areaId ?? 'none'} bbox=[${south},${north},${west},${east}]`
  );

  return { bbox: [south, north, west, east], displayName: first.display_name, areaId };
}

// ─── Step 2: Overpass QL Generator & Query with Failover ──────────────────────

function buildOverpassQuery(
  bbox: [number, number, number, number],
  businessType?: string,
  areaId?: number
): string {
  const [south, north, west, east] = bbox;
  // If an exact administrative area polygon is resolved, use area.searchArea for 100% boundary accuracy!
  const spatialFilter = areaId ? `(area.searchArea)` : `(${south},${west},${north},${east})`;
  const areaHeader = areaId ? `area(${areaId})->.searchArea;\n` : '';

  let filters: string[] = [];

  switch (businessType) {
    case 'salons':
      filters = [`nw["shop"~"hairdresser|barber|hair_salon"]${spatialFilter};`];
      break;

    case 'beauty':
      filters = [
        `nw["shop"~"beauty|cosmetics|nail_salon|hairdresser|barber"]${spatialFilter};`,
        `nw["amenity"="beauty"]${spatialFilter};`,
      ];
      break;

    case 'restaurants':
      filters = [`nw["amenity"~"restaurant|fast_food|food_court|bistro"]${spatialFilter};`];
      break;

    case 'cafes':
      filters = [
        `nw["amenity"~"cafe|bakery|coffee_shop"]${spatialFilter};`,
        `nw["shop"~"bakery|pastry|coffee"]${spatialFilter};`,
      ];
      break;

    case 'clinics':
      filters = [
        `nw["amenity"~"clinic|doctors|hospital"]${spatialFilter};`,
        `nw["healthcare"~"clinic|doctor|centre"]${spatialFilter};`,
      ];
      break;

    case 'dentists':
      filters = [
        `nw["amenity"="dentist"]${spatialFilter};`,
        `nw["healthcare"="dentist"]${spatialFilter};`,
      ];
      break;

    case 'spas':
      filters = [
        `nw["amenity"="spa"]${spatialFilter};`,
        `nw["shop"="massage"]${spatialFilter};`,
        `nw["leisure"="sauna"]${spatialFilter};`,
      ];
      break;

    case 'pharmacies':
      filters = [
        `nw["amenity"="pharmacy"]${spatialFilter};`,
        `nw["healthcare"="pharmacy"]${spatialFilter};`,
      ];
      break;

    case 'gyms':
      filters = [
        `nw["leisure"~"fitness_centre|sports_centre"]${spatialFilter};`,
        `nw["sport"="fitness"]${spatialFilter};`,
      ];
      break;

    case 'auto':
      filters = [
        `nw["shop"~"car_repair|car_parts|car|motorcycle"]${spatialFilter};`,
        `nw["amenity"="car_wash"]${spatialFilter};`,
      ];
      break;

    case 'hotels':
      filters = [`nw["tourism"~"hotel|motel|guest_house|hostel|resort"]${spatialFilter};`];
      break;

    case 'pets':
      filters = [
        `nw["amenity"="veterinary"]${spatialFilter};`,
        `nw["shop"~"pet|pet_grooming"]${spatialFilter};`,
      ];
      break;

    case 'all':
    default:
      filters = [
        `nw["amenity"~"restaurant|cafe|clinic|dentist|beauty|fast_food|bar|pub|pharmacy|hospital"]${spatialFilter};`,
        `nw["shop"~"hairdresser|beauty|salon|cosmetics|health_food|optician|massage|bakery"]${spatialFilter};`,
      ];
      break;
  }

  return `
[out:json][timeout:25];
${areaHeader}(
  ${filters.join('\n  ')}
);
out center 150;
  `.trim();
}

async function queryOverpass(
  bbox: [number, number, number, number],
  businessType?: string,
  areaId?: number
): Promise<OsmElement[]> {
  const [south, north, west, east] = bbox;
  const overpassQuery = buildOverpassQuery(bbox, businessType, areaId);

  console.log(
    `[discover] Querying Overpass with areaId=${areaId ?? 'bbox'} category: "${businessType ?? 'all'}"`
  );

  let lastError: Error | null = null;

  // Try each mirror sequentially with failover
  for (const mirror of OVERPASS_MIRRORS) {
    try {
      console.log(`[discover] Trying Overpass mirror: ${mirror}`);
      const response = await fetch(mirror, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'User-Agent': 'LeadHunter/1.0 (local-lead-generation-tool)',
        },
        body: `data=${encodeURIComponent(overpassQuery)}`,
        signal: AbortSignal.timeout(18000), // 18s per mirror
      });

      if (!response.ok) {
        const text = await response.text().catch(() => '');
        console.warn(
          `[discover] Mirror ${mirror} returned HTTP ${response.status} (${text.slice(0, 80)}). Failing over...`
        );
        lastError = new Error(`Overpass mirror ${mirror} returned status ${response.status}`);
        continue;
      }

      const data = (await response.json()) as OverpassResponse;
      const elements = data.elements ?? [];

      console.log(`[discover] Overpass mirror ${mirror} returned ${elements.length} raw elements`);
      return elements;
    } catch (err) {
      console.warn(
        `[discover] Mirror ${mirror} failed: ${err instanceof Error ? err.message : String(err)}. Trying next mirror...`
      );
      lastError = err instanceof Error ? err : new Error(String(err));
    }
  }

  throw (
    lastError ??
    new Error(
      'All OpenStreetMap Overpass servers are currently busy. Please try again in a few seconds or select a specific city/category.'
    )
  );
}

// ─── Step 3: Map OSM → Lead schema ────────────────────────────────────────────

function mapElementsToLeads(elements: OsmElement[], fallbackArea: string): LeadInsert[] {
  const seen = new Set<string>();
  const leads: LeadInsert[] = [];

  for (const element of elements) {
    const tags = element.tags ?? {};

    // Skip elements with no name — we can't display them as a business
    const businessName = tags.name?.trim();
    if (!businessName) continue;

    const placeId = `osm_${element.type}_${element.id}`;

    // Deduplicate
    if (seen.has(placeId)) continue;
    seen.add(placeId);

    const websiteUrl = tags['website'] ?? tags['contact:website'] ?? null;
    const phone = tags['phone'] ?? tags['contact:phone'] ?? null;
    const address = buildAddress(tags, fallbackArea);

    // Build a Google-Maps-style deep link from lat/lon (node coords or way center)
    const lat = element.lat ?? element.center?.lat;
    const lon = element.lon ?? element.center?.lon;
    let googleMapsUrl: string | null = null;
    if (lat !== undefined && lon !== undefined) {
      googleMapsUrl = `https://www.google.com/maps/search/?api=1&query=${lat},${lon}`;
    }

    leads.push({
      place_id: placeId,
      business_name: businessName,
      address,
      phone: phone ?? null,
      google_maps_url: googleMapsUrl,
      website_url: websiteUrl,
      email: null,
      facebook_url: null,
      instagram_url: null,
      website_status: determineWebsiteStatus(websiteUrl),
      outreached: false,
    });
  }

  console.log(`[discover] Mapped ${leads.length} valid leads from ${elements.length} OSM elements`);
  return leads;
}

// ─── Route Handler ────────────────────────────────────────────────────────────

/**
 * POST /api/discover
 *
 * Body: { searchQuery?: string, province?: string, city?: string, businessType?: string }
 */
export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as DiscoverRequest;
    const { searchQuery, province, city, businessType } = body;

    // Determine query location string for Nominatim
    let locationTarget = '';

    if (searchQuery && searchQuery.trim()) {
      locationTarget = searchQuery.trim();
    } else if (province && province.trim()) {
      const isAllCities = !city || city.trim() === '' || city.startsWith('All ');
      const cleanCity = city ? city.replace(/\s*\(.*?\)\s*/g, ' ').trim() : '';
      const cleanProvince = province.replace(/\s*\(.*?\)\s*/g, ' ').trim();
      locationTarget = isAllCities || !cleanCity
        ? `${cleanProvince}, Philippines`
        : `${cleanCity}, ${cleanProvince}, Philippines`;
    }

    if (!locationTarget) {
      return NextResponse.json(
        { error: 'Please select a province or enter a search query.' },
        { status: 400 }
      );
    }

    const { supabaseServer } = await import('@/lib/supabase');

    console.log(
      `[discover] Starting discovery: location="${locationTarget}", category="${businessType ?? 'all'}"`
    );

    // ── Step 1: Geocode via Nominatim ─────────────────────────────────────────
    const { bbox, displayName, areaId } = await geocodeQuery(locationTarget);

    // ── Step 2: Query Overpass with mirror failover ───────────────────────────
    const elements = await queryOverpass(bbox, businessType, areaId);

    if (elements.length === 0) {
      console.warn(`[discover] Overpass returned 0 elements for "${locationTarget}"`);
      return NextResponse.json({
        leads: [],
        message: 'No businesses found in this area with the selected filter.',
      });
    }

    // ── Step 3: Map elements → lead rows ─────────────────────────────────────
    const leadsToInsert = mapElementsToLeads(elements, displayName);

    if (leadsToInsert.length === 0) {
      return NextResponse.json({
        leads: [],
        message: 'OSM returned locations in this area, but none had business names registered.',
      });
    }

    // ── Step 4: Upsert into Supabase ──────────────────────────────────────────
    const CHUNK_SIZE = 100;
    const allUpserted: Lead[] = [];

    for (let i = 0; i < leadsToInsert.length; i += CHUNK_SIZE) {
      const chunk = leadsToInsert.slice(i, i + CHUNK_SIZE);

      const { data: upsertedChunk, error: dbError } = await supabaseServer
        .from('leads')
        .upsert(chunk, {
          onConflict: 'place_id',
          ignoreDuplicates: false,
        })
        .select();

      if (dbError) {
        console.warn(`[discover] Supabase upsert warning on chunk ${i / CHUNK_SIZE + 1}:`, dbError.message);
        // Fallback: If table is not migrated yet in Supabase, provide generated IDs
        // so the user still sees all real discovered leads in the UI!
        const fallbackLeads: Lead[] = leadsToInsert.map((item, idx) => ({
          ...item,
          id: `lead_${Date.now()}_${idx}`,
          created_at: new Date().toISOString(),
        }));

        console.log(`[discover] Returned ${fallbackLeads.length} leads in memory (Supabase migration pending)`);
        return NextResponse.json({
          leads: fallbackLeads,
          warning: 'Note: Run supabase/migrations/001_create_leads.sql in your Supabase SQL editor to save leads permanently.',
        });
      }

      if (upsertedChunk) {
        allUpserted.push(...(upsertedChunk as Lead[]));
      }
    }

    console.log(`[discover] Successfully upserted ${allUpserted.length} leads for "${locationTarget}"`);

    return NextResponse.json({ leads: allUpserted });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'An unexpected error occurred';
    console.error('[discover] Unhandled error:', err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
