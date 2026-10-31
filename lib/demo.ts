import type { DiscoverRequest, Lead } from '../types/lead';
export function createDemoLeads(request: DiscoverRequest): Lead[] {
  const area = [request.city, request.province].filter(Boolean).join(', ') || request.searchQuery || 'Sample district';
  const names = ['Northfield', 'Cedar Lane', 'Daybreak', 'Riverbend', 'Meadow', 'Cornerstone'];
  const statuses: Lead['website_status'][] = ['NO_WEBSITE', 'FB_ONLY', 'CUSTOM_WEBSITE', 'DEAD_LINK', 'NO_WEBSITE', 'CUSTOM_WEBSITE'];
  return names.map((name, i) => ({
    id: `demo-${i + 1}`, place_id: `demo-${i + 1}`,
    business_name: `${name} ${request.businessType || 'Business'} (sample)`,
    address: `Sample address ${i + 1}, ${area}`, phone: null, google_maps_url: null,
    website_status: statuses[i], website_url: statuses[i] === 'CUSTOM_WEBSITE' ? `https://example.com/demo-${i + 1}` : null,
    email: null, facebook_url: null, instagram_url: null, outreached: false,
    created_at: '2026-01-01T00:00:00.000Z',
  }));
}
