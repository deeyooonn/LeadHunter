// TypeScript types for the Lead data model

export type WebsiteStatus = 'NO_WEBSITE' | 'FB_ONLY' | 'CUSTOM_WEBSITE' | 'DEAD_LINK';
export type ScanStatus = 'NOT_SCANNED' | 'CONTACTS_FOUND' | 'NOTHING_FOUND' | 'DEAD_LINK' | 'BLOCKED' | 'ERROR';
export interface SocialLink { platform: string; url: string }
export interface Contacts { phones: string[]; emails: string[]; socials: SocialLink[] }
export interface ScanResult {
  contacts: Contacts;
  status: Exclude<ScanStatus, 'NOT_SCANNED'>;
  reason: string;
  scannedAt: string;
  pages: string[];
  source: 'website' | 'social' | 'archive' | 'renderer';
}

export interface Lead {
  id: string;
  place_id: string;
  business_name: string;
  address: string;
  phone: string | null;
  google_maps_url: string | null;
  website_url: string | null;
  email: string | null;
  facebook_url: string | null;
  instagram_url: string | null;
  website_status: WebsiteStatus;
  outreached: boolean;
  created_at: string;
  category?: string;
  latitude?: number;
  longitude?: number;
  osm_contacts?: Contacts;
  scraped_contacts?: Contacts;
  scan_status?: ScanStatus;
  scan_reason?: string;
  scanned_at?: string;
}

export type LeadInsert = Omit<Lead, 'id' | 'created_at'>;

export interface DiscoverRequest {
  searchQuery?: string;
  province?: string;
  city?: string;
  limit?: number;
}

export interface DiscoverResponse {
  leads: Lead[];
  matchedArea?: { id: string; name: string };
  cached?: boolean;
  warning?: string;
  error?: string;
}

export interface EnrichRequest {
  lead_id: string;
  website_url: string;
  force?: boolean;
}

export interface EnrichResponse {
  email: string | null;
  facebook_url: string | null;
  instagram_url: string | null;
  website_status: WebsiteStatus;
  error?: string;
  scan?: ScanResult;
  cached?: boolean;
  warning?: string;
}
