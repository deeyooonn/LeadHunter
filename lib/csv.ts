import type { Lead } from '../types/lead';
import { contactsForLead } from './contact-data';
export function csvCell(value: string, text = false): string {
  // Quoting alone does not prevent spreadsheet formulas or numeric coercion.
  const safe = (text && value.length > 0) || /^[\s\u0000-\u001f]*[=+@-]/.test(value) ? `'${value}` : value;
  return `"${safe.replaceAll('"', '""')}"`;
}
export function leadsCsv(leads: Lead[]): string {
  const headers = ['Business', 'Category', 'Address', 'Phones', 'Emails', 'Facebook', 'Other socials', 'Website', 'Scan status', 'Reason', 'Scanned at', 'Map', 'Outreached'];
  return '\uFEFF' + [headers.map(h => csvCell(h)).join(','), ...leads.map(lead => {
    const contacts = contactsForLead(lead);
    const values = [lead.business_name, lead.category ?? '', lead.address, contacts.phones.join('; '), contacts.emails.join('; '), contacts.socials.filter(s => s.platform === 'Facebook').map(s => s.url).join('; '), contacts.socials.filter(s => s.platform !== 'Facebook').map(s => `${s.platform}: ${s.url}`).join('; '), lead.website_url ?? '', lead.scan_status ?? 'NOT_SCANNED', lead.scan_reason ?? '', lead.scanned_at ?? '', lead.google_maps_url ?? '', lead.outreached ? 'Yes' : 'No'];
    return values.map((value, index) => csvCell(value, index === 3)).join(',');
  })].join('\r\n');
}
