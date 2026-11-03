# Original LeadHunter deployment

The deployed Next.js application uses live OpenStreetMap discovery and actual website enrichment. Synthetic portfolio responses and the sample-data banner have been removed.

Production configuration uses the original project's NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY and server-only SUPABASE_SERVICE_ROLE_KEY. Do not commit private settings.

The original Supabase project `wmqsqvupaaodvcvekryg` was restored on 2026-11-03. Its public schema was empty, so `supabase/migrations/001_create_leads.sql` was applied to create the table expected by the application. A server-role empty read now returns HTTP 200; an anonymous read is denied. No fabricated leads were inserted. The same active free project now hosts separate Margal account/reservation tables; browser roles still cannot read leads.

Real discovered results can be used during the session and exported to CSV when persistence fails. Website enrichment returns its actual result plus a visible saving-unavailable notice when saving fails. External discovery/enrichment availability remains separate from database connectivity.

Verify npm ci, npm run build, input validation, an actual discovery request, enrichment, CSV export and small-phone layout. External OSM/websites can be unavailable or rate-limited.
