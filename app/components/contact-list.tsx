'use client';
import { Phone, Mail, Copy, Check } from 'lucide-react';
import { useState } from 'react';
import type { Contacts } from '@/types/lead';
import { hasContacts } from '@/lib/contact-data';
export function ContactList({ contacts }: { contacts: Contacts }) {
  const [copied, setCopied] = useState('');
  const [copyError, setCopyError] = useState(false);
  async function copy(value: string) {
    try { await navigator.clipboard.writeText(value); setCopied(value); setCopyError(false); }
    catch { setCopyError(true); }
  }
  if (!hasContacts(contacts)) return <span className="muted">No contacts yet</span>;
  return <div className="contacts">
    {contacts.phones.map(phone => <div className="contact-line" key={phone}><Phone size={13} /><a href={`tel:${phone}`}>{phone}</a><button className="copy-button" onClick={() => copy(phone)} aria-label={`Copy ${phone}`}>{copied === phone ? <Check size={12} /> : <Copy size={12} />}</button></div>)}
    {contacts.emails.map(email => <div className="contact-line" key={email}><Mail size={13} /><a href={`mailto:${email}`}>{email}</a><button className="copy-button" onClick={() => copy(email)} aria-label={`Copy ${email}`}>{copied === email ? <Check size={12} /> : <Copy size={12} />}</button></div>)}
    {contacts.socials.length > 0 && <div className="social-links">{contacts.socials.map(social => <a key={social.url} href={social.url} target="_blank" rel="noopener noreferrer" title={social.url}>{social.platform}<span aria-hidden="true"> ↗</span></a>)}</div>}
    {copyError && <span role="status" className="muted">Could not copy. Select the contact to copy it manually.</span>}
  </div>;
}
