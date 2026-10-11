import type { Contacts, Lead, SocialLink } from '../types/lead';
import { normalizePhone } from './phones';

export function externalUrl(value: string): string | undefined {
  try { const url = new URL(value); return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password ? url.href : undefined; } catch { return undefined; }
}

export const emptyContacts = (): Contacts => ({ phones: [], emails: [], socials: [] });
export const hasContacts = (c: Contacts) => Boolean(c.phones.length || c.emails.length || c.socials.length);
export function mergeContacts(...sets: (Contacts | undefined)[]): Contacts {
  const result = emptyContacts();
  for (const set of sets) if (set) {
    result.phones.push(...set.phones); result.emails.push(...set.emails); result.socials.push(...set.socials);
  }
  result.phones = [...new Set(result.phones.flatMap(phone => phone.split(/[;,]/).map(value => normalizePhone(value) ?? value.trim())).filter(Boolean))].slice(0, 30);
  result.emails = [...new Set(result.emails.map(e => e.toLowerCase()))].slice(0, 30);
  result.socials = [...new Map(result.socials.filter(s => externalUrl(s.url)).map(s => [s.url, s])).values()].slice(0, 30);
  return result;
}
export function contactsForLead(lead: Lead): Contacts {
  const socials: SocialLink[] = [];
  if (lead.facebook_url) socials.push({ platform: 'Facebook', url: lead.facebook_url });
  if (lead.instagram_url) socials.push({ platform: 'Instagram', url: lead.instagram_url });
  return mergeContacts(lead.osm_contacts, lead.scraped_contacts, { phones: lead.phone ? [lead.phone] : [], emails: lead.email ? [lead.email] : [], socials });
}
