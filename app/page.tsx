'use client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowDownToLine, ArrowUpRight, Check, Globe, Loader2, MapPin, Search, Square, Target, X } from 'lucide-react';
import type { DiscoverResponse, EnrichResponse, Lead, ScanStatus } from '@/types/lead';
import { contactsForLead, externalUrl, mergeContacts } from '@/lib/contact-data';
import { leadsCsv } from '@/lib/csv';
import { ThemeToggle } from './components/theme-toggle';
import { ContactList } from './components/contact-list';
import { LocationInput } from './components/location-input';

const STATUS_LABELS: Record<ScanStatus, string> = { NOT_SCANNED: 'Not scanned', CONTACTS_FOUND: 'Contacts found', NOTHING_FOUND: 'Nothing found', DEAD_LINK: 'Dead link', BLOCKED: 'Blocked', ERROR: 'Error' };
const displayHost = (value: string) => { try { return new URL(value).hostname.replace(/^www\./, ''); } catch { return value; } };
export default function Dashboard() {
  const [location, setLocation] = useState('');
  const [limit, setLimit] = useState(100);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [matchedArea, setMatchedArea] = useState('');
  const [searching, setSearching] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState<ScanStatus | 'ALL'>('ALL');
  const [hasPhone, setHasPhone] = useState(false);
  const [hasEmail, setHasEmail] = useState(false);
  const [hasFacebook, setHasFacebook] = useState(false);
  const [scanning, setScanning] = useState<Set<string>>(new Set());
  const [bulk, setBulk] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [rendererAvailable, setRendererAvailable] = useState(false);
  const [allowRenderer, setAllowRenderer] = useState(false);
  const [authRequired, setAuthRequired] = useState(false);
  const [accessKey, setAccessKey] = useState('');
  const controllers = useRef(new Map<string, AbortController>());
  const stopRequested = useRef(false);
  const generation = useRef(0);
  const searchController = useRef<AbortController | null>(null);
  const scanningRef = useRef(controllers.current);
  useEffect(() => {
    const config = new AbortController();
    void fetch('/api/config', { signal: config.signal }).then(res => res.json()).then((data: { rendererAvailable?: boolean; authRequired?: boolean }) => { setRendererAvailable(Boolean(data.rendererAvailable)); setAuthRequired(Boolean(data.authRequired)); }).catch(() => {});
    const active = scanningRef.current;
    return () => { config.abort(); searchController.current?.abort(); for (const controller of active.values()) controller.abort(); };
  }, []);
  const headers = useCallback(() => ({ 'Content-Type': 'application/json', ...(accessKey ? { Authorization: `Bearer ${accessKey}` } : {}) }), [accessKey]);
  const enriched = useMemo(() => leads.map(lead => ({ lead, contacts: contactsForLead(lead) })), [leads]);
  const filtered = useMemo(() => {
    const term = query.trim().toLocaleLowerCase();
    return enriched.filter(({ lead, contacts }) => {
      if (status !== 'ALL' && (lead.scan_status ?? 'NOT_SCANNED') !== status) return false;
      if (hasPhone && !contacts.phones.length || hasEmail && !contacts.emails.length || hasFacebook && !contacts.socials.some(s => s.platform === 'Facebook')) return false;
      return !term || [lead.business_name, lead.address, lead.category, ...contacts.phones, ...contacts.emails, ...contacts.socials.map(s => s.url)].join(' ').toLocaleLowerCase().includes(term);
    });
  }, [enriched, query, status, hasPhone, hasEmail, hasFacebook]);
  const counts = useMemo(() => ({ total: leads.length, phone: enriched.filter(row => row.contacts.phones.length).length, email: enriched.filter(row => row.contacts.emails.length).length, facebook: enriched.filter(row => row.contacts.socials.some(s => s.platform === 'Facebook')).length }), [leads.length, enriched]);
  const stop = useCallback(() => {
    stopRequested.current = true;
    for (const controller of controllers.current.values()) controller.abort();
    setNotice('Scanning stopped. Completed results are kept.');
  }, []);
  const search = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!location.trim() || searching || bulk) return;
    searchController.current?.abort();
    const controller = new AbortController(); searchController.current = controller;
    const current = ++generation.current;
    for (const controller of controllers.current.values()) controller.abort();
    setSearching(true); setHasSearched(true); setLeads([]); setMatchedArea(''); setError(''); setNotice('');
    setStatus('ALL'); setQuery(''); setHasPhone(false); setHasEmail(false); setHasFacebook(false);
    try {
      const response = await fetch('/api/discover', { method: 'POST', headers: headers(), body: JSON.stringify({ searchQuery: location.trim(), limit }), signal: controller.signal });
      const data = await response.json() as DiscoverResponse;
      if (!response.ok) throw new Error(data.error ?? 'Search could not be completed.');
      if (generation.current !== current) return;
      setLeads(data.leads); setMatchedArea(data.matchedArea?.name ?? '');
      setNotice(data.warning ?? (data.cached ? 'Showing saved map results. Contact scans are kept separately.' : ''));
    } catch (error) { if (!controller.signal.aborted) setError(error instanceof Error ? error.message : 'Search failed.'); }
    finally { if (generation.current === current) setSearching(false); }
  };
  const scan = useCallback(async (lead: Lead, force = false) => {
    if (!lead.website_url || controllers.current.has(lead.id)) return;
    const current = generation.current;
    const controller = new AbortController(); controllers.current.set(lead.id, controller);
    setScanning(previous => new Set(previous).add(lead.id));
    try {
      const response = await fetch('/api/enrich', { method: 'POST', headers: headers(), signal: controller.signal, body: JSON.stringify({ lead_id: lead.id, website_url: lead.website_url, force, allow_renderer: allowRenderer }) });
      const data = await response.json() as EnrichResponse;
      if (!response.ok || !data.scan) throw new Error(data.error ?? 'Scan failed. Please try again.');
      const result = data.scan;
      if (generation.current !== current) return;
      setLeads(previous => previous.map(row => row.id === lead.id ? { ...row, scraped_contacts: mergeContacts(row.scraped_contacts, result.contacts), scan_status: result.status, scan_reason: result.reason, scanned_at: result.scannedAt } : row));
      if (data.warning) setNotice(data.warning);
    } catch (error) {
      if (!controller.signal.aborted && generation.current === current) {
        const reason = error instanceof Error ? error.message : 'Scan failed.';
        setLeads(previous => previous.map(row => row.id === lead.id ? { ...row, scan_status: 'ERROR', scan_reason: reason } : row));
      }
    } finally {
      controllers.current.delete(lead.id);
      setScanning(previous => { const next = new Set(previous); next.delete(lead.id); return next; });
    }
  }, [headers, allowRenderer]);
  const scanAll = async () => {
    const pending = filtered.map(row => row.lead).filter(lead => lead.website_url && (!lead.scan_status || lead.scan_status === 'NOT_SCANNED'));
    if (!pending.length) { setNotice('All visible businesses with websites have been scanned. Use Rescan to check one again.'); return; }
    stopRequested.current = false; setBulk(true); setProgress({ done: 0, total: pending.length }); setNotice('');
    let next = 0;
    const worker = async () => {
      while (!stopRequested.current && next < pending.length) {
        const lead = pending[next++]; await scan(lead);
        if (!stopRequested.current) setProgress(previous => ({ ...previous, done: previous.done + 1 }));
      }
    };
    await Promise.all([worker(), worker()]); setBulk(false);
    if (!stopRequested.current) setNotice('Scanning complete. Review contact details and scan reasons below.');
  };
  const exportCsv = () => {
    const url = URL.createObjectURL(new Blob([leadsCsv(filtered.map(row => row.lead))], { type: 'text/csv;charset=utf-8;' }));
    const anchor = document.createElement('a'); anchor.href = url; anchor.download = 'leadhunter-contacts.csv'; anchor.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  return <main className="dashboard">
    <header className="page-header">
      <div><div className="brand"><Target size={26} strokeWidth={1.7} /><h1>LeadHunter<span className="brand-dot">.</span></h1><span className="region-tag">PHILIPPINES</span></div><p className="subtitle">Find your next local client.</p></div>
      <div className="header-actions"><ThemeToggle /><button className="button secondary" onClick={exportCsv} disabled={!filtered.length}><ArrowDownToLine size={15} />Export CSV<span className="button-count">{filtered.length}</span></button></div>
    </header>
    <section className="search-panel" aria-labelledby="search-heading">
      <div className="section-heading"><div><span className="eyebrow">YOUR NEXT OPPORTUNITY</span><h2 id="search-heading">Start with a place.</h2></div><span className="search-note"><MapPin size={14} />Verified area boundaries</span></div>
      <form onSubmit={search} className="search-form">
        <div className="location-field"><label htmlFor="location">Province, city, or municipality</label><LocationInput value={location} onChange={setLocation} /></div>
        <div className="limit-field"><label htmlFor="limit">Result limit</label><select id="limit" value={limit} onChange={event => setLimit(Number(event.target.value))}>{[25, 50, 100, 250, 500].map(value => <option key={value} value={value}>{value} businesses</option>)}</select></div>
        <button className="button primary search-submit" disabled={searching || bulk || !location.trim()}>{searching ? <Loader2 size={17} className="spin" /> : <Search size={17} />}{searching ? 'Finding businesses…' : 'Discover leads'}</button>
        {authRequired && <div className="access-field"><label htmlFor="access-key">Workspace access key</label><input id="access-key" type="password" value={accessKey} onChange={event => setAccessKey(event.target.value)} autoComplete="off" /></div>}
      </form>
      <div className="search-context" role="status">{matchedArea ? <><Check size={14} /><span>Results limited to <strong>{matchedArea}</strong></span></> : <><Globe size={14} /><span>Search local businesses across all categories. Choose a location to begin.</span></>}</div>
    </section>
    {error && <div className="message error-message" role="alert">{error}<button aria-label="Dismiss error" onClick={() => setError('')}><X size={16} /></button></div>}
    {notice && <div className="message" role="status">{notice}<button aria-label="Dismiss notice" onClick={() => setNotice('')}><X size={16} /></button></div>}
    <section className="summary" aria-label="Result summary">{[['Businesses', counts.total], ['With a phone', counts.phone], ['With an email', counts.email], ['On Facebook', counts.facebook]].map(([label, count]) => <div className="summary-item" key={label}><span>{label}</span><strong>{count}<span className="summary-rule" /></strong></div>)}</section>
    <section className="results-panel" aria-labelledby="results-heading">
      <div className="results-heading"><div><span className="eyebrow">YOUR WORKSPACE</span><h2 id="results-heading">Business directory <span className="count-pill">{filtered.length}</span></h2></div><button className="button primary compact" onClick={bulk ? stop : scanAll} disabled={searching || (!bulk && (!leads.length || scanning.size > 0))}>{bulk ? <><Square size={13} />Stop scanning</> : <><Search size={14} />Scan visible websites</>}</button></div>
      {bulk && <div className="scan-progress" role="status"><progress value={progress.done} max={progress.total} aria-label="Bulk scan progress" /><span>{progress.done} of {progress.total} scanned</span></div>}
      {rendererAvailable && <label className="renderer-option"><input type="checkbox" checked={allowRenderer} onChange={event => setAllowRenderer(event.target.checked)} disabled={bulk} />Use the optional page renderer for JavaScript sites. This shares public business URLs with the configured third party.</label>}
      <div className="filters"><div className="input-icon table-search"><Search size={15} /><input aria-label="Filter businesses" placeholder="Filter names, contacts, or addresses…" value={query} onChange={event => setQuery(event.target.value)} /></div><select aria-label="Filter by scan status" value={status} onChange={event => setStatus(event.target.value as ScanStatus | 'ALL')}><option value="ALL">All scan statuses</option>{Object.entries(STATUS_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select><div className="contact-filters"><label><input type="checkbox" checked={hasPhone} onChange={event => setHasPhone(event.target.checked)} />Has phone</label><label><input type="checkbox" checked={hasEmail} onChange={event => setHasEmail(event.target.checked)} />Has email</label><label><input type="checkbox" checked={hasFacebook} onChange={event => setHasFacebook(event.target.checked)} />Has Facebook</label></div></div>
      <div className="table-scroll" tabIndex={0} role="region" aria-label="Business results"><table><thead><tr><th scope="col">Business</th><th scope="col">Contact details</th><th scope="col">Website</th><th scope="col">Scan status</th><th scope="col" className="actions-heading">Actions</th></tr></thead><tbody>
        {searching ? <tr><td colSpan={5}><div className="empty-state"><Loader2 className="spin" size={25} /><h3>Looking inside your selected area</h3><p>Resolving the boundary and finding mapped businesses. Larger areas can take a little longer.</p></div></td></tr> : !filtered.length ? <tr><td colSpan={5}><div className="empty-state"><MapPin size={28} strokeWidth={1.4} /><h3>{!hasSearched ? 'Good leads start close to home.' : leads.length ? 'No businesses match these filters.' : 'No results to show yet.'}</h3><p>{!hasSearched ? 'Choose a Philippine province or city above. Then scan business websites to find the people behind them.' : leads.length ? 'Try a different keyword or clear the contact and status filters.' : error ? 'Resolve the search error above, then try again.' : 'Try a nearby municipality. OpenStreetMap coverage varies by area.'}</p></div></td></tr> : filtered.map(({ lead, contacts }) => {
          const active = scanning.has(lead.id), scanStatus = lead.scan_status ?? 'NOT_SCANNED';
          return <tr className="business-row" key={lead.id}><td><div className="business-name">{lead.business_name}</div><div className="category">{lead.category ?? 'Local business'}</div><p className="address">{lead.address}</p></td><td data-label="Contact details"><ContactList contacts={contacts} /></td><td data-label="Website">{lead.website_url ? <a className="website-link" href={externalUrl(lead.website_url)} target="_blank" rel="noopener noreferrer">{displayHost(lead.website_url)}<ArrowUpRight size={13} /></a> : <span className="muted">No website listed</span>}</td><td data-label="Scan status"><span className={`status status-${scanStatus.toLowerCase()}`}>{active ? <><Loader2 size={11} className="spin" />Scanning</> : STATUS_LABELS[scanStatus]}</span>{lead.scan_reason && <p className="scan-reason">{lead.scan_reason}</p>}{lead.scanned_at && <time className="scan-date" dateTime={lead.scanned_at}>{new Date(lead.scanned_at).toLocaleString('en-PH', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Manila' })}</time>}</td><td data-label="Actions"><div className="row-actions"><button className="button secondary compact" disabled={active || bulk || !lead.website_url} onClick={() => scan(lead, scanStatus !== 'NOT_SCANNED')}>{active ? <Loader2 size={13} className="spin" /> : <Search size={13} />}{scanStatus === 'NOT_SCANNED' ? 'Scan' : 'Rescan'}</button>{lead.google_maps_url && <a className="map-action" href={externalUrl(lead.google_maps_url)} target="_blank" rel="noopener noreferrer"><MapPin size={12} />Map</a>}</div></td></tr>;
        })}
      </tbody></table></div>
      <div className="table-footer"><span>Showing {filtered.length} of {leads.length} businesses</span><span>Public contacts · Local connections</span></div>
    </section>
    <footer className="page-footer"><span>LeadHunter<span className="brand-dot">.</span> <span className="muted">A little research. A better connection.</span></span><a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">© OpenStreetMap contributors</a></footer>
  </main>;
}
