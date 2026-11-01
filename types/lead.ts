// TypeScript types for the Lead data model

export type WebsiteStatus = 'NO_WEBSITE' | 'FB_ONLY' | 'CUSTOM_WEBSITE' | 'DEAD_LINK';

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
}

export type LeadInsert = Omit<Lead, 'id' | 'created_at'>;

export interface DiscoverRequest {
  searchQuery?: string;
  province?: string;
  city?: string;
  businessType?: string;
}

export interface DiscoverResponse {
  leads: Lead[];
  error?: string;
}

export interface EnrichRequest {
  lead_id: string;
  website_url: string;
}

export interface EnrichResponse {
  warning?: string;
  email: string | null;
  facebook_url: string | null;
  instagram_url: string | null;
  website_status: WebsiteStatus;
  error?: string;
}
