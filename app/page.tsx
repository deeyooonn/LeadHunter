'use client';

import { useState, useCallback, useMemo, useEffect } from 'react';
import {
  Search,
  Download,
  Copy,
  Check,
  Globe,
  Facebook,
  Instagram,
  Phone,
  Mail,
  MapPin,
  Zap,
  RefreshCw,
  AlertCircle,
  TrendingUp,
  Users,
  Target,
  ExternalLink,
  ChevronDown,
  Loader2,
  Filter,
  Building2,
  SlidersHorizontal,
  X,
  Sparkles,
} from 'lucide-react';
import type { Lead, WebsiteStatus, DiscoverRequest } from '@/types/lead';
import { PROVINCES_DATA, BUSINESS_TYPES } from '@/lib/locations';

// ─── Status Badge Config ──────────────────────────────────────────────────────

const STATUS_CONFIG: Record<
  WebsiteStatus,
  { label: string; color: string; bg: string; icon: React.ReactNode }
> = {
  NO_WEBSITE: {
    label: 'No Website',
    color: 'text-rose-400',
    bg: 'bg-rose-500/10 border border-rose-500/20',
    icon: <AlertCircle size={10} />,
  },
  FB_ONLY: {
    label: 'FB Only',
    color: 'text-blue-400',
    bg: 'bg-blue-500/10 border border-blue-500/20',
    icon: <Facebook size={10} />,
  },
  CUSTOM_WEBSITE: {
    label: 'Has Website',
    color: 'text-emerald-400',
    bg: 'bg-emerald-500/10 border border-emerald-500/20',
    icon: <Globe size={10} />,
  },
  DEAD_LINK: {
    label: 'Dead Link',
    color: 'text-amber-400',
    bg: 'bg-amber-500/10 border border-amber-500/20',
    icon: <AlertCircle size={10} />,
  },
};

// ─── Sub-components ───────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: WebsiteStatus }) {
  const config = STATUS_CONFIG[status];
  return (
    <span className={`badge ${config.color} ${config.bg}`}>
      {config.icon}
      {config.label}
    </span>
  );
}

function CopyButton({ value, id }: { value: string; id: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      const el = document.createElement('textarea');
      el.value = value;
      document.body.appendChild(el);
      el.select();
      document.execCommand('copy');
      document.body.removeChild(el);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <button
      id={`copy-${id}`}
      onClick={handleCopy}
      title={copied ? 'Copied!' : `Copy ${value}`}
      className="ml-1 p-1 rounded opacity-0 group-hover:opacity-100 transition-all duration-150 hover:bg-white/10 text-slate-400 hover:text-white"
    >
      {copied ? (
        <Check size={12} className="text-emerald-400" />
      ) : (
        <Copy size={12} />
      )}
    </button>
  );
}

function SkeletonRow() {
  return (
    <tr>
      {[200, 160, 120, 100, 140, 80].map((w, i) => (
        <td key={i} className="px-4 py-3">
          <div className="skeleton h-4" style={{ width: w }} />
        </td>
      ))}
    </tr>
  );
}

function StatCard({
  icon,
  label,
  value,
  accent,
}: {
  icon: React.ReactNode;
  label: string;
  value: number | string;
  accent: string;
}) {
  return (
    <div className="stat-card rounded-xl p-4 flex items-center gap-3">
      <div className={`p-2 rounded-lg ${accent} bg-opacity-20`}>{icon}</div>
      <div>
        <div className="text-2xl font-bold text-white">{value}</div>
        <div className="text-xs text-slate-400">{label}</div>
      </div>
    </div>
  );
}

// ─── CSV Export ───────────────────────────────────────────────────────────────

function exportToCSV(leads: Lead[]) {
  const headers = [
    'Business Name',
    'Address',
    'Phone',
    'Website Status',
    'Website URL',
    'Email',
    'Facebook',
    'Instagram',
    'Google Maps',
    'Outreached',
  ];

  const rows = leads.map((lead) => [
    lead.business_name,
    lead.address,
    lead.phone ?? '',
    lead.website_status,
    lead.website_url ?? '',
    lead.email ?? '',
    lead.facebook_url ?? '',
    lead.instagram_url ?? '',
    lead.google_maps_url ?? '',
    lead.outreached ? 'Yes' : 'No',
  ]);

  const csvContent = [
    headers.join(','),
    ...rows.map((row) =>
      row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(',')
    ),
  ].join('\n');

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `leads_${new Date().toISOString().split('T')[0]}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function Dashboard() {
  // Search Mode: 'dropdown' | 'freeform'
  const [searchMode, setSearchMode] = useState<'dropdown' | 'freeform'>('dropdown');

  // Dropdown filter states
  const [selectedProvince, setSelectedProvince] = useState('Bulacan');
  const [selectedCity, setSelectedCity] = useState('All Cities & Municipalities');
  const [selectedBusinessType, setSelectedBusinessType] = useState('salons');
  const [customProvince, setCustomProvince] = useState('');
  const [customCity, setCustomCity] = useState('');

  // Freeform search state
  const [freeformQuery, setFreeformQuery] = useState('');

  // Table local filters
  const [tableSearch, setTableSearch] = useState('');
  const [tableStatusFilter, setTableStatusFilter] = useState<'ALL' | WebsiteStatus>('ALL');

  // Data & execution state
  const [leads, setLeads] = useState<Lead[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [enrichingIds, setEnrichingIds] = useState<Set<string>>(new Set());
  const [enrichingAll, setEnrichingAll] = useState(false);
  const [enrichProgress, setEnrichProgress] = useState({ current: 0, total: 0 });
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const [hasSearched, setHasSearched] = useState(false);
  const [storageNotice, setStorageNotice] = useState<string | null>(null);

  // Available cities based on selected province
  const availableCities = useMemo(() => {
    const provinceObj = PROVINCES_DATA.find((p) => p.name === selectedProvince);
    return provinceObj ? provinceObj.cities : ['All Cities & Municipalities'];
  }, [selectedProvince]);

  // When province changes, reset city to the first option
  useEffect(() => {
    if (availableCities.length > 0) {
      setSelectedCity(availableCities[0]);
    }
  }, [selectedProvince, availableCities]);

  // Active business type label
  const activeBusinessTypeObj = useMemo(() => {
    return BUSINESS_TYPES.find((b) => b.id === selectedBusinessType) ?? BUSINESS_TYPES[0];
  }, [selectedBusinessType]);

  // Effective location and type strings for live preview
  const effectiveProvince = selectedProvince === 'OTHER' ? customProvince : selectedProvince;
  const effectiveCity =
    selectedProvince === 'OTHER'
      ? customCity
      : selectedCity === 'All Cities & Municipalities'
      ? ''
      : selectedCity;

  // ── Toast helper ────────────────────────────────────────────────────────────
  const showToast = useCallback((message: string, type: 'success' | 'error' = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3500);
  }, []);

  // ── Search handler ──────────────────────────────────────────────────────────
  const handleSearch = useCallback(async () => {
    setIsSearching(true);
    setError(null);
    setHasSearched(true);
    setStorageNotice(null);

    try {
      const payload: DiscoverRequest = {};

      if (searchMode === 'dropdown') {
        const prov = selectedProvince === 'OTHER' ? customProvince.trim() : selectedProvince;
        const cty =
          selectedProvince === 'OTHER'
            ? customCity.trim()
            : selectedCity === 'All Cities & Municipalities'
            ? ''
            : selectedCity;

        if (!prov) {
          throw new Error('Please select or specify a province.');
        }

        payload.province = prov;
        payload.city = cty;
        payload.businessType = selectedBusinessType;
      } else {
        if (!freeformQuery.trim()) {
          throw new Error('Please enter a search query.');
        }
        payload.searchQuery = freeformQuery.trim();
      }

      const res = await fetch('/api/discover', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error ?? `Server returned ${res.status}`);
      }

      const foundLeads: Lead[] = data.leads ?? [];
      setLeads(foundLeads);
      setStorageNotice(data.warning || null);

      if (foundLeads.length > 0) {
        showToast(`Discovered ${foundLeads.length} leads in ${effectiveProvince || 'the area'}!`, 'success');
      } else {
        showToast(data.message ?? 'No leads found in this area.', 'error');
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Search failed';
      setError(message);
      showToast(message, 'error');
    } finally {
      setIsSearching(false);
    }
  }, [
    searchMode,
    selectedProvince,
    selectedCity,
    selectedBusinessType,
    customProvince,
    customCity,
    freeformQuery,
    effectiveProvince,
    showToast,
  ]);

  // ── Enrich single lead ──────────────────────────────────────────────────────
  const handleEnrich = useCallback(
    async (lead: Lead) => {
      if (!lead.website_url || enrichingIds.has(lead.id)) return;

      setEnrichingIds((prev) => new Set(prev).add(lead.id));

      try {
        const res = await fetch('/api/enrich', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            lead_id: lead.id,
            website_url: lead.website_url,
          }),
        });

        const data = await res.json();

        if (!res.ok) {
          throw new Error(data.error ?? `Enrich failed for ${lead.business_name}`);
        }

        setLeads((prev) =>
          prev.map((l) =>
            l.id === lead.id
              ? {
                  ...l,
                  email: data.email,
                  facebook_url: data.facebook_url,
                  instagram_url: data.instagram_url,
                  website_status: data.website_status,
                }
              : l
          )
        );

        if (data.warning) setStorageNotice(data.warning);
        if (data.email) {
          showToast(`✓ Found email for ${lead.business_name}: ${data.email}`, 'success');
        } else {
          showToast(`Checked ${lead.business_name} (no email found)`, 'success');
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Enrichment failed';
        showToast(message, 'error');
      } finally {
        setEnrichingIds((prev) => {
          const next = new Set(prev);
          next.delete(lead.id);
          return next;
        });
      }
    },
    [enrichingIds, showToast]
  );

  // ── Enrich all leads with websites ──────────────────────────────────────────
  const handleEnrichAll = useCallback(async () => {
    const enrichable = leads.filter(
      (l) => l.website_url && l.website_status === 'CUSTOM_WEBSITE' && !l.email
    );

    if (enrichable.length === 0) {
      showToast('No unenriched leads with websites to scrape', 'error');
      return;
    }

    setEnrichingAll(true);
    setEnrichProgress({ current: 0, total: enrichable.length });

    let count = 0;
    for (const lead of enrichable) {
      await handleEnrich(lead);
      count++;
      setEnrichProgress({ current: count, total: enrichable.length });
    }

    setEnrichingAll(false);
    showToast(`Bulk enrichment finished for ${enrichable.length} leads!`, 'success');
  }, [leads, handleEnrich, showToast]);

  // ── Filtered leads for the table ────────────────────────────────────────────
  const filteredLeads = useMemo(() => {
    return leads.filter((lead) => {
      // Status filter
      if (tableStatusFilter !== 'ALL' && lead.website_status !== tableStatusFilter) {
        return false;
      }

      // Keyword search
      if (tableSearch.trim()) {
        const term = tableSearch.toLowerCase();
        const matchesName = lead.business_name.toLowerCase().includes(term);
        const matchesAddress = lead.address.toLowerCase().includes(term);
        const matchesPhone = lead.phone?.toLowerCase().includes(term);
        const matchesEmail = lead.email?.toLowerCase().includes(term);
        return matchesName || matchesAddress || matchesPhone || matchesEmail;
      }

      return true;
    });
  }, [leads, tableStatusFilter, tableSearch]);

  // ── Stats ───────────────────────────────────────────────────────────────────
  const stats = useMemo(() => {
    return {
      total: leads.length,
      withWebsite: leads.filter((l) => l.website_status === 'CUSTOM_WEBSITE').length,
      withEmail: leads.filter((l) => l.email).length,
      withSocials: leads.filter((l) => l.facebook_url || l.instagram_url).length,
      noWebsite: leads.filter((l) => l.website_status === 'NO_WEBSITE').length,
    };
  }, [leads]);

  return (
    <div className="min-h-screen p-4 md:p-8">
      <div className="max-w-7xl mx-auto">
        {storageNotice && <p role="status" className="mb-5 rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">{storageNotice}</p>}
        {/* ── Header ────────────────────────────────────────────────────────── */}
        <header className="mb-8">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-brand-600/20 border border-brand-500/30 shadow-lg shadow-brand-500/10">
                <Target className="text-brand-400" size={26} />
              </div>
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h1 className="text-3xl font-bold gradient-text tracking-tight">
                    LeadHunter
                  </h1>
                  <span className="text-xs bg-brand-500/20 text-brand-300 border border-brand-500/30 px-2 py-0.5 rounded-full font-mono font-semibold">
                    PRO
                  </span>
                  <span className="text-xs bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-2 py-0.5 rounded-full font-mono">
                    100% Free OSM
                  </span>
                </div>
                <p className="text-slate-400 text-xs sm:text-sm mt-0.5">
                  Local business discovery & contact scraping for Philippines and worldwide
                </p>
              </div>
            </div>

            {/* Quick Actions */}
            {leads.length > 0 && (
              <div className="flex items-center gap-2 self-start sm:self-auto">
                <button
                  id="export-csv-btn"
                  onClick={() => exportToCSV(leads)}
                  className="btn-secondary px-3.5 py-2 rounded-xl text-xs sm:text-sm text-slate-300 flex items-center gap-2"
                >
                  <Download size={14} className="text-emerald-400" />
                  Export CSV ({leads.length})
                </button>
              </div>
            )}
          </div>
        </header>

        {/* ── Search & Filter Box ────────────────────────────────────────────── */}
        <div className="glass-card rounded-2xl p-5 mb-6 shadow-2xl">
          {/* Mode Tabs */}
          <div className="flex items-center justify-between border-b border-white/5 pb-3 mb-4">
            <div className="flex items-center gap-2">
              <button
                onClick={() => setSearchMode('dropdown')}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium flex items-center gap-2 transition-all ${
                  searchMode === 'dropdown'
                    ? 'bg-brand-500/20 text-brand-300 border border-brand-500/30 shadow-sm'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <SlidersHorizontal size={13} />
                Dropdown Filters
              </button>
              <button
                onClick={() => setSearchMode('freeform')}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium flex items-center gap-2 transition-all ${
                  searchMode === 'freeform'
                    ? 'bg-brand-500/20 text-brand-300 border border-brand-500/30 shadow-sm'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <Search size={13} />
                Custom Text Search
              </button>
            </div>

            <div className="text-xs text-slate-400 hidden sm:block">
              OpenStreetMap · Overpass QL
            </div>
          </div>

          {/* MODE 1: Dropdown Filters */}
          {searchMode === 'dropdown' && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                {/* 1. Province Dropdown */}
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1.5 flex items-center gap-1.5">
                    <MapPin size={13} className="text-brand-400" />
                    Province
                  </label>
                  <select
                    id="province-select"
                    value={selectedProvince}
                    onChange={(e) => setSelectedProvince(e.target.value)}
                    className="select-input w-full px-3 py-2.5 rounded-xl text-sm cursor-pointer"
                  >
                    {PROVINCES_DATA.map((p) => (
                      <option key={p.name} value={p.name}>
                        {p.name}
                      </option>
                    ))}
                    <option value="OTHER">── Other / Custom Province ──</option>
                  </select>

                  {selectedProvince === 'OTHER' && (
                    <input
                      type="text"
                      value={customProvince}
                      onChange={(e) => setCustomProvince(e.target.value)}
                      placeholder="Type province name..."
                      className="search-input w-full mt-2 px-3 py-2 rounded-xl text-xs"
                    />
                  )}
                </div>

                {/* 2. City / Municipality Dropdown */}
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1.5 flex items-center gap-1.5">
                    <Building2 size={13} className="text-emerald-400" />
                    City / Municipality
                  </label>
                  {selectedProvince !== 'OTHER' ? (
                    <select
                      id="city-select"
                      value={selectedCity}
                      onChange={(e) => setSelectedCity(e.target.value)}
                      className="select-input w-full px-3 py-2.5 rounded-xl text-sm cursor-pointer"
                    >
                      {availableCities.map((c) => (
                        <option key={c} value={c}>
                          {c}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <input
                      type="text"
                      value={customCity}
                      onChange={(e) => setCustomCity(e.target.value)}
                      placeholder="Type city name (or leave blank for all)..."
                      className="search-input w-full px-3 py-2.5 rounded-xl text-sm"
                    />
                  )}
                </div>

                {/* 3. Business Type Dropdown */}
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1.5 flex items-center gap-1.5">
                    <Sparkles size={13} className="text-amber-400" />
                    Type of Business
                  </label>
                  <select
                    id="business-type-select"
                    value={selectedBusinessType}
                    onChange={(e) => setSelectedBusinessType(e.target.value)}
                    className="select-input w-full px-3 py-2.5 rounded-xl text-sm cursor-pointer"
                  >
                    {BUSINESS_TYPES.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.icon} {b.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Action row with Target Summary and Search Button */}
              <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-2">
                <div className="flex items-center gap-2 text-xs text-slate-400 bg-white/5 border border-white/10 px-3 py-2 rounded-xl w-full sm:w-auto">
                  <span className="text-brand-300 font-medium">Target:</span>
                  <span className="text-white font-medium flex items-center gap-1">
                    {activeBusinessTypeObj.icon} {activeBusinessTypeObj.name}
                  </span>
                  <span>in</span>
                  <span className="text-emerald-300 font-medium">
                    {effectiveCity ? `${effectiveCity}, ` : ''}
                    {effectiveProvince || 'Philippines'}
                  </span>
                </div>

                <button
                  id="search-btn"
                  onClick={handleSearch}
                  disabled={isSearching}
                  className="btn-primary w-full sm:w-auto px-6 py-2.5 rounded-xl text-white font-semibold text-sm flex items-center justify-center gap-2 whitespace-nowrap"
                >
                  {isSearching ? (
                    <>
                      <Loader2 size={16} className="animate-spin" />
                      Querying OSM...
                    </>
                  ) : (
                    <>
                      <Zap size={16} />
                      Discover Leads
                    </>
                  )}
                </button>
              </div>
            </div>
          )}

          {/* MODE 2: Freeform Search */}
          {searchMode === 'freeform' && (
            <div className="space-y-3">
              <div className="flex flex-col sm:flex-row gap-3">
                <div className="flex-1 relative">
                  <Search
                    className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500"
                    size={18}
                  />
                  <input
                    id="freeform-search-input"
                    type="text"
                    value={freeformQuery}
                    onChange={(e) => setFreeformQuery(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                    placeholder='e.g. "Hair Salons in Marilao, Bulacan" or "Dentists in Quezon City"'
                    className="search-input w-full pl-10 pr-4 py-3 rounded-xl text-sm"
                  />
                </div>
                <button
                  onClick={handleSearch}
                  disabled={isSearching || !freeformQuery.trim()}
                  className="btn-primary px-6 py-3 rounded-xl text-white font-semibold text-sm flex items-center justify-center gap-2 whitespace-nowrap"
                >
                  {isSearching ? (
                    <>
                      <Loader2 size={16} className="animate-spin" />
                      Searching...
                    </>
                  ) : (
                    <>
                      <Zap size={16} />
                      Search
                    </>
                  )}
                </button>
              </div>

              {/* Quick Suggestion Chips */}
              <div className="flex flex-wrap items-center gap-1.5 text-xs">
                <span className="text-slate-500 mr-1">Try quick searches:</span>
                {[
                  'Salons in Bulacan',
                  'Dental Clinics in Manila',
                  'Cafes in Marilao',
                  'Restaurants in Angeles, Pampanga',
                ].map((chip) => (
                  <button
                    key={chip}
                    onClick={() => {
                      setFreeformQuery(chip);
                    }}
                    className="px-2.5 py-1 rounded-lg bg-white/5 hover:bg-brand-500/20 hover:text-brand-300 text-slate-400 transition-colors"
                  >
                    {chip}
                  </button>
                ))}
              </div>
            </div>
          )}

          {error && (
            <div className="mt-3 flex items-center gap-2 text-rose-400 text-xs bg-rose-500/10 border border-rose-500/20 rounded-lg px-3 py-2">
              <AlertCircle size={14} />
              {error}
            </div>
          )}
        </div>

        {/* ── Stats Cards ───────────────────────────────────────────────────── */}
        {leads.length > 0 && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
            <StatCard
              icon={<Users size={18} className="text-brand-400" />}
              label="Total Discovered"
              value={stats.total}
              accent="bg-brand-500/20"
            />
            <StatCard
              icon={<Globe size={18} className="text-emerald-400" />}
              label="With Website"
              value={stats.withWebsite}
              accent="bg-emerald-500/20"
            />
            <StatCard
              icon={<Mail size={18} className="text-violet-400" />}
              label="Emails Scraped"
              value={stats.withEmail}
              accent="bg-violet-500/20"
            />
            <StatCard
              icon={<TrendingUp size={18} className="text-blue-400" />}
              label="Social Links"
              value={stats.withSocials}
              accent="bg-blue-500/20"
            />
          </div>
        )}

        {/* ── Table Toolbar & In-Table Filters ──────────────────────────────── */}
        {leads.length > 0 && (
          <div className="glass-card rounded-2xl p-4 mb-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
            {/* Filter pills */}
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-xs text-slate-400 mr-1 flex items-center gap-1">
                <Filter size={12} /> Status:
              </span>
              {[
                { id: 'ALL', label: 'All' },
                { id: 'CUSTOM_WEBSITE', label: 'Has Website' },
                { id: 'NO_WEBSITE', label: 'No Website' },
                { id: 'FB_ONLY', label: 'FB Only' },
                { id: 'DEAD_LINK', label: 'Dead Link' },
              ].map((pill) => (
                <button
                  key={pill.id}
                  onClick={() => setTableStatusFilter(pill.id as 'ALL' | WebsiteStatus)}
                  className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-all ${
                    tableStatusFilter === pill.id
                      ? 'bg-brand-500/20 text-brand-300 border border-brand-500/30'
                      : 'text-slate-400 hover:text-white bg-white/5 hover:bg-white/10'
                  }`}
                >
                  {pill.label}
                </button>
              ))}
            </div>

            {/* Quick in-table search & Bulk enrich */}
            <div className="flex items-center gap-2">
              <div className="relative">
                <Search
                  size={14}
                  className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500"
                />
                <input
                  type="text"
                  value={tableSearch}
                  onChange={(e) => setTableSearch(e.target.value)}
                  placeholder="Filter results..."
                  className="search-input pl-8 pr-3 py-1.5 rounded-xl text-xs w-44"
                />
                {tableSearch && (
                  <button
                    onClick={() => setTableSearch('')}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-500 hover:text-white"
                  >
                    <X size={12} />
                  </button>
                )}
              </div>

              <button
                id="enrich-all-btn"
                onClick={handleEnrichAll}
                disabled={enrichingAll}
                className="btn-secondary px-3 py-1.5 rounded-xl text-xs text-slate-300 flex items-center gap-1.5"
              >
                {enrichingAll ? (
                  <Loader2 size={13} className="animate-spin text-brand-400" />
                ) : (
                  <RefreshCw size={13} className="text-brand-400" />
                )}
                {enrichingAll
                  ? `Scraping (${enrichProgress.current}/${enrichProgress.total})`
                  : 'Enrich All'}
              </button>
            </div>
          </div>
        )}

        {/* ── Data Table ────────────────────────────────────────────────────── */}
        <div className="glass-card rounded-2xl overflow-hidden shadow-2xl">
          <div className="overflow-x-auto" tabIndex={0} role="region" aria-label="Lead results, scroll horizontally to see all columns">
            <table className="lead-table w-full min-w-[850px]">
              <thead>
                <tr>
                  <th className="px-4 py-3.5 text-left">Business Name</th>
                  <th className="px-4 py-3.5 text-left">Address</th>
                  <th className="px-4 py-3.5 text-left">Phone</th>
                  <th className="px-4 py-3.5 text-left">Status</th>
                  <th className="px-4 py-3.5 text-left">Email</th>
                  <th className="px-4 py-3.5 text-left">Socials & Web</th>
                  <th className="px-4 py-3.5 text-left">Action</th>
                </tr>
              </thead>
              <tbody>
                {/* Skeleton Loader */}
                {isSearching &&
                  Array.from({ length: 6 }).map((_, i) => (
                    <SkeletonRow key={`skeleton-${i}`} />
                  ))}

                {/* Empty State after search */}
                {!isSearching && hasSearched && filteredLeads.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-4 py-16 text-center">
                      <div className="flex flex-col items-center gap-3">
                        <div className="p-4 rounded-2xl bg-slate-800/50">
                          <Search size={32} className="text-slate-600" />
                        </div>
                        <p className="text-slate-300 text-sm font-medium">
                          No leads matched your criteria.
                        </p>
                        <p className="text-slate-500 text-xs max-w-sm">
                          Try switching to a broader city or province, or selecting &quot;All Business Categories&quot;.
                        </p>
                      </div>
                    </td>
                  </tr>
                )}

                {/* Prompt Before First Search */}
                {!isSearching && !hasSearched && (
                  <tr>
                    <td colSpan={7} className="px-4 py-20 text-center">
                      <div className="flex flex-col items-center gap-3">
                        <div className="p-4 rounded-2xl bg-brand-500/10 border border-brand-500/20 shadow-lg shadow-brand-500/10">
                          <Target size={36} className="text-brand-400" />
                        </div>
                        <p className="text-slate-200 text-base font-medium">Ready to hunt leads</p>
                        <p className="text-slate-400 text-xs max-w-md leading-relaxed">
                          Choose your target <strong>Province</strong>, <strong>City</strong>, and{' '}
                          <strong>Type of Business</strong> using the dropdown filters above, then click{' '}
                          <span className="text-brand-400 font-semibold">Discover Leads</span>.
                        </p>
                      </div>
                    </td>
                  </tr>
                )}

                {/* Lead Rows */}
                {!isSearching &&
                  filteredLeads.map((lead) => {
                    const isEnriching = enrichingIds.has(lead.id);
                    const canEnrich =
                      lead.website_url &&
                      lead.website_status === 'CUSTOM_WEBSITE';

                    return (
                      <tr key={lead.id} className="group">
                        {/* Business Name & Deep Link */}
                        <td className="px-4 py-3">
                          <div className="flex flex-col">
                            <span className="text-white text-sm font-medium leading-tight">
                              {lead.business_name}
                            </span>
                            {lead.google_maps_url && (
                              <a
                                href={lead.google_maps_url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-brand-400 text-xs flex items-center gap-0.5 mt-0.5 hover:text-brand-300 transition-colors w-fit"
                              >
                                <MapPin size={10} />
                                Maps View
                                <ExternalLink size={9} />
                              </a>
                            )}
                          </div>
                        </td>

                        {/* Address */}
                        <td className="px-4 py-3 max-w-[220px]">
                          <span className="text-slate-400 text-xs line-clamp-2 leading-relaxed">
                            {lead.address || '—'}
                          </span>
                        </td>

                        {/* Phone */}
                        <td className="px-4 py-3">
                          {lead.phone ? (
                            <div className="flex items-center group/phone">
                              <span className="text-slate-300 text-xs flex items-center gap-1 font-mono">
                                <Phone size={11} className="text-slate-500" />
                                {lead.phone}
                              </span>
                              <CopyButton value={lead.phone} id={`phone-${lead.id}`} />
                            </div>
                          ) : (
                            <span className="text-slate-600 text-xs">—</span>
                          )}
                        </td>

                        {/* Status */}
                        <td className="px-4 py-3">
                          <StatusBadge status={lead.website_status} />
                        </td>

                        {/* Email */}
                        <td className="px-4 py-3">
                          {lead.email ? (
                            <div className="flex items-center group/email">
                              <span className="text-violet-300 text-xs flex items-center gap-1 font-mono">
                                <Mail size={11} className="text-violet-400" />
                                <span className="max-w-[150px] truncate">{lead.email}</span>
                              </span>
                              <CopyButton value={lead.email} id={`email-${lead.id}`} />
                            </div>
                          ) : (
                            <span className="text-slate-600 text-xs">
                              {isEnriching ? (
                                <span className="text-brand-400 flex items-center gap-1">
                                  <Loader2 size={10} className="animate-spin" />
                                  Scraping...
                                </span>
                              ) : (
                                '—'
                              )}
                            </span>
                          )}
                        </td>

                        {/* Social Links */}
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1.5">
                            {lead.facebook_url && (
                              <a
                                href={lead.facebook_url}
                                target="_blank"
                                rel="noopener noreferrer"
                                title="Facebook Page"
                                className="p-1.5 rounded-lg bg-blue-500/10 text-blue-400 hover:bg-blue-500/20 transition-colors"
                              >
                                <Facebook size={12} />
                              </a>
                            )}
                            {lead.instagram_url && (
                              <a
                                href={lead.instagram_url}
                                target="_blank"
                                rel="noopener noreferrer"
                                title="Instagram Page"
                                className="p-1.5 rounded-lg bg-pink-500/10 text-pink-400 hover:bg-pink-500/20 transition-colors"
                              >
                                <Instagram size={12} />
                              </a>
                            )}
                            {lead.website_url && lead.website_status !== 'FB_ONLY' && (
                              <a
                                href={lead.website_url}
                                target="_blank"
                                rel="noopener noreferrer"
                                title="Visit Website"
                                className="p-1.5 rounded-lg bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 transition-colors"
                              >
                                <Globe size={12} />
                              </a>
                            )}
                            {!lead.facebook_url && !lead.instagram_url && !lead.website_url && (
                              <span className="text-slate-600 text-xs">—</span>
                            )}
                          </div>
                        </td>

                        {/* Actions */}
                        <td className="px-4 py-3">
                          {canEnrich ? (
                            <button
                              id={`enrich-${lead.id}`}
                              onClick={() => handleEnrich(lead)}
                              disabled={isEnriching}
                              className="px-2.5 py-1 rounded-lg text-xs font-medium transition-all flex items-center gap-1.5 bg-brand-500/10 border border-brand-500/30 text-brand-300 hover:bg-brand-500/20 disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                              {isEnriching ? (
                                <>
                                  <Loader2 size={11} className="animate-spin" />
                                  Scraping
                                </>
                              ) : (
                                <>
                                  <Zap size={11} />
                                  Enrich
                                </>
                              )}
                            </button>
                          ) : (
                            <span className="text-slate-600 text-xs">
                              {lead.website_status === 'NO_WEBSITE'
                                ? 'No URL'
                                : lead.website_status === 'DEAD_LINK'
                                ? 'Dead link'
                                : lead.email
                                ? 'Done ✓'
                                : '—'}
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>

          {/* Table Footer Count */}
          {leads.length > 0 && (
            <div className="px-4 py-2.5 bg-white/[0.02] border-t border-white/5 flex items-center justify-between text-xs text-slate-500">
              <span>
                Showing {filteredLeads.length} of {leads.length} leads
              </span>
              {tableStatusFilter !== 'ALL' && (
                <button
                  onClick={() => setTableStatusFilter('ALL')}
                  className="text-brand-400 hover:underline"
                >
                  Clear status filter
                </button>
              )}
            </div>
          )}
        </div>

        {/* ── Footer ────────────────────────────────────────────────────────── */}
        <footer className="mt-8 text-center text-slate-600 text-xs">
          LeadHunter · OpenStreetMap (Nominatim + Overpass API) + Cheerio Scraping + Supabase
        </footer>
      </div>

      {/* ── Toast Notification ──────────────────────────────────────────────── */}
      {toast && (
        <div
          className={`fixed bottom-6 left-1/2 -translate-x-1/2 z-50 toast-in px-4 py-3 rounded-xl text-sm font-medium flex items-center gap-2 shadow-2xl ${
            toast.type === 'success'
              ? 'bg-emerald-500/20 border border-emerald-500/40 text-emerald-300'
              : 'bg-rose-500/20 border border-rose-500/40 text-rose-300'
          }`}
        >
          {toast.type === 'success' ? (
            <Check size={14} />
          ) : (
            <AlertCircle size={14} />
          )}
          {toast.message}
        </div>
      )}
    </div>
  );
}
