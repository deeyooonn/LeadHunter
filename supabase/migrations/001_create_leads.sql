-- Local Lead Generation & Info Collector
-- Database Migration: 001_create_leads.sql
-- Run this in your Supabase Dashboard → SQL Editor

-- Enable UUID extension (already enabled in Supabase by default)
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Drop existing table if needed (comment out if you want to preserve data)
-- DROP TABLE IF EXISTS public.leads;

-- Create the leads table
CREATE TABLE IF NOT EXISTS public.leads (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  place_id        TEXT NOT NULL UNIQUE,
  business_name   TEXT NOT NULL,
  address         TEXT NOT NULL DEFAULT '',
  phone           TEXT,
  google_maps_url TEXT,
  website_url     TEXT,
  email           TEXT,
  facebook_url    TEXT,
  instagram_url   TEXT,
  website_status  TEXT NOT NULL DEFAULT 'NO_WEBSITE'
                    CHECK (website_status IN ('NO_WEBSITE', 'FB_ONLY', 'CUSTOM_WEBSITE', 'DEAD_LINK')),
  outreached      BOOLEAN NOT NULL DEFAULT FALSE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create index on place_id for fast upserts
CREATE INDEX IF NOT EXISTS idx_leads_place_id ON public.leads (place_id);

-- Create index on website_status for filtering
CREATE INDEX IF NOT EXISTS idx_leads_website_status ON public.leads (website_status);

-- Create index on created_at for sorting
CREATE INDEX IF NOT EXISTS idx_leads_created_at ON public.leads (created_at DESC);

-- Enable Row Level Security (RLS)
ALTER TABLE public.leads ENABLE ROW LEVEL SECURITY;

-- Allow all operations with service role key (used by API routes)
-- For production, restrict this to authenticated users
CREATE POLICY "Allow all operations for service role"
  ON public.leads
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- Optional: Allow read access to anonymous users (remove if you want auth)
CREATE POLICY "Allow read for all"
  ON public.leads
  FOR SELECT
  TO anon
  USING (true);

-- Comment on table
COMMENT ON TABLE public.leads IS 'Local business leads collected from Google Places API';
COMMENT ON COLUMN public.leads.place_id IS 'Unique Google Places ID for deduplication';
COMMENT ON COLUMN public.leads.website_status IS 'NO_WEBSITE | FB_ONLY | CUSTOM_WEBSITE | DEAD_LINK';
COMMENT ON COLUMN public.leads.outreached IS 'Whether this lead has been contacted';
