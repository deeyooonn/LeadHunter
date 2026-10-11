import type { Lead, ScanResult } from '../types/lead';
import type { ResolvedArea } from './geocoding';
import { mergeContacts } from './contact-data';
import { normalizeUrl } from './safe-fetch';

// Temporary process-local caches. Restarting the server clears all entries.
type Discovery = { area: ResolvedArea; leads: Lead[] };
const recentDiscoveries = new Map<string, { value: Discovery; expires: number }>();
const recentScans = new Map<string, ScanResult>();

export function readDiscoveryCache(key: string): Discovery | null {
  const recent = recentDiscoveries.get(key);
  if (recent && recent.expires > Date.now()) return structuredClone(recent.value);
  recentDiscoveries.delete(key);
  return null;
}

export function writeDiscoveryCache(key: string, area: ResolvedArea, leads: Lead[]): void {
  recentDiscoveries.delete(key);
  recentDiscoveries.set(key, { value: structuredClone({ area, leads }), expires: Date.now() + 10 * 60000 });
  while (recentDiscoveries.size > 8) recentDiscoveries.delete(recentDiscoveries.keys().next().value!);
}

export function readScan(url: string): ScanResult | null {
  const scan = recentScans.get(normalizeUrl(url).href);
  return scan ? structuredClone(scan) : null;
}

export function saveScan(url: string, scan: ScanResult): ScanResult {
  const key = normalizeUrl(url).href;
  const stored = structuredClone({ ...scan, contacts: mergeContacts(recentScans.get(key)?.contacts, scan.contacts) });
  recentScans.delete(key);
  recentScans.set(key, stored);
  while (recentScans.size > 500) recentScans.delete(recentScans.keys().next().value!);
  return structuredClone(stored);
}

export function withCachedScans(leads: Lead[]): Lead[] {
  return leads.map(lead => {
    let scan: ScanResult | null = null;
    try { scan = lead.website_url ? readScan(lead.website_url) : null; } catch { /* Invalid map URLs remain unscanned. */ }
    return scan ? { ...lead, scraped_contacts: mergeContacts(lead.scraped_contacts, scan.contacts), scan_status: scan.status, scan_reason: scan.reason, scanned_at: scan.scannedAt } : lead;
  });
}
