import { NextRequest, NextResponse } from 'next/server';
import { normalizeUrl } from '@/lib/safe-fetch';
import { scanWebsite } from '@/lib/scraper/scan';
import { readScan, saveScan } from '@/lib/lead-store';
import { rejectCrossSite } from '@/lib/api-guard';
import type { EnrichResponse, ScanResult } from '@/types/lead';

export const runtime = 'nodejs';
export const maxDuration = 60;
const inFlight = new Map<string, Promise<ScanResult>>();
export async function POST(request: NextRequest) {
  const rejected = rejectCrossSite(request); if (rejected) return rejected;
  try {
    const body: unknown = await request.json();
    if (!body || typeof body !== 'object') return NextResponse.json({ error: 'Invalid scan request.' }, { status: 400 });
    const input = body as Record<string, unknown>;
    if (typeof input.lead_id !== 'string' || !/^(?:osm_(?:node|way|relation)_\d{1,20}|[a-f0-9-]{36})$/i.test(input.lead_id) || typeof input.website_url !== 'string') return NextResponse.json({ error: 'A valid lead ID and website URL are required.' }, { status: 400 });
    const url = normalizeUrl(input.website_url).href;
    let scan = input.force === true ? null : readScan(url);
    const cached = Boolean(scan);
    if (!scan) {
      let pending = inFlight.get(url);
      if (!pending) {
        if (inFlight.size >= 2) return NextResponse.json({ error: 'Two scans are already running. Please wait.' }, { status: 429 });
        pending = scanWebsite(url, { signal: request.signal, rendererUrl: input.allow_renderer === true ? process.env.SCRAPER_RENDERER_URL : undefined, archive: process.env.SCRAPER_ARCHIVE_ENABLED !== 'false' });
        inFlight.set(url, pending);
      }
      try { scan = await pending; } finally { if (inFlight.get(url) === pending) inFlight.delete(url); }
    }
    request.signal.throwIfAborted();
    scan = saveScan(url, scan);
    const response: EnrichResponse = {
      scan, cached, email: scan.contacts.emails[0] ?? null,
      facebook_url: scan.contacts.socials.find(s => s.platform === 'Facebook')?.url ?? null,
      instagram_url: scan.contacts.socials.find(s => s.platform === 'Instagram')?.url ?? null,
      website_status: scan.status === 'DEAD_LINK' ? 'DEAD_LINK' : scan.source === 'social' ? 'FB_ONLY' : 'CUSTOM_WEBSITE',
    };
    return NextResponse.json(response);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Scan failed.' }, { status: 400 });
  }
}
