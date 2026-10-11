import type { Lead } from '../types/lead';
import type { OsmElement } from './overpass';
import { businessCategory } from './overpass';
import { emptyContacts, mergeContacts } from './contact-data';
import { extractEmails, extractPhones, normalizePhone, socialLink } from './scraper/parse';

export function mapBusiness(element: OsmElement, areaName: string): Lead {
  const tags = element.tags ?? {};
  const contacts = emptyContacts();
  for (const key of ['phone', 'contact:phone', 'mobile', 'contact:mobile', 'contact:whatsapp']) {
    const raw = tags[key] ?? '';
    contacts.phones.push(...extractPhones(raw));
    const phone = normalizePhone(raw); if (phone) contacts.phones.push(phone);
  }
  for (const key of ['email', 'contact:email']) contacts.emails.push(...extractEmails(tags[key] ?? ''));
  for (const platform of ['facebook', 'instagram', 'twitter', 'linkedin', 'youtube', 'tiktok', 'telegram', 'whatsapp']) {
    const raw = tags[`contact:${platform}`] ?? tags[platform];
    if (raw) { const link = socialLink(raw); if (link) contacts.socials.push(link); }
  }
  let website: string | null = null;
  try {
    const raw = tags.website ?? tags['contact:website'];
    if (raw) {
      const url = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
      if (['http:', 'https:'].includes(url.protocol) && !url.username && !url.password) website = url.href;
    }
  } catch { /* Invalid map URLs stay unavailable. */ }
  const social = website ? socialLink(website) : null;
  if (social) contacts.socials.push(social);
  const lat = element.lat ?? element.center?.lat, lon = element.lon ?? element.center?.lon;
  const osm = mergeContacts(contacts);
  return {
    id: `osm_${element.type}_${element.id}`, place_id: `osm_${element.type}_${element.id}`, business_name: tags.name ?? '',
    address: [tags['addr:housenumber'], tags['addr:street'], tags['addr:city'], tags['addr:state']].filter(Boolean).join(', ') || areaName,
    website_url: website, google_maps_url: `https://www.google.com/maps/search/?api=1&query=${lat},${lon}`,
    phone: null, email: null, facebook_url: null, instagram_url: null, outreached: false,
    website_status: !website ? 'NO_WEBSITE' : social?.platform === 'Facebook' ? 'FB_ONLY' : 'CUSTOM_WEBSITE',
    category: businessCategory(tags), latitude: lat, longitude: lon, osm_contacts: osm,
    scraped_contacts: emptyContacts(), scan_status: 'NOT_SCANNED', created_at: new Date().toISOString(),
  };
}
