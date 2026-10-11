-- Additive migration: retains every existing lead, legacy field, and migration.
BEGIN;
ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS category TEXT,
  ADD COLUMN IF NOT EXISTS latitude DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS longitude DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS osm_contacts JSONB NOT NULL DEFAULT '{"phones":[],"emails":[],"socials":[]}',
  ADD COLUMN IF NOT EXISTS scraped_contacts JSONB NOT NULL DEFAULT '{"phones":[],"emails":[],"socials":[]}',
  ADD COLUMN IF NOT EXISTS scan_status TEXT NOT NULL DEFAULT 'NOT_SCANNED'
    CHECK (scan_status IN ('NOT_SCANNED','CONTACTS_FOUND','NOTHING_FOUND','DEAD_LINK','BLOCKED','ERROR')),
  ADD COLUMN IF NOT EXISTS scan_reason TEXT,
  ADD COLUMN IF NOT EXISTS scanned_at TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS public.discovery_cache (
  cache_key TEXT PRIMARY KEY,
  area JSONB NOT NULL,
  leads JSONB NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL
);
CREATE TABLE IF NOT EXISTS public.scan_cache (
  website_url TEXT PRIMARY KEY,
  result JSONB NOT NULL,
  scanned_at TIMESTAMPTZ NOT NULL
);
ALTER TABLE public.leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.discovery_cache ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.scan_cache ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all operations for service role" ON public.leads;
DROP POLICY IF EXISTS "Allow read for all" ON public.leads;
REVOKE ALL ON public.leads, public.discovery_cache, public.scan_cache FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.leads, public.discovery_cache, public.scan_cache TO service_role;
COMMENT ON TABLE public.leads IS 'OpenStreetMap businesses; mapped and scraped contacts are stored separately';
COMMENT ON COLUMN public.leads.place_id IS 'Stable OSM element type and ID';
COMMIT;
