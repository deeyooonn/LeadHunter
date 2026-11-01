# Original LeadHunter deployment

The deployed Next.js application uses live OpenStreetMap discovery and actual website enrichment. Synthetic portfolio responses and the sample-data banner have been removed.

Production configuration uses the original project's NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY and server-only SUPABASE_SERVICE_ROLE_KEY. Do not commit private settings.

The existing Supabase hostname failed DNS resolution during this release. Real discovered results can be used during the session and exported to CSV when persistence fails. Website enrichment now returns its actual result plus a visible saving-unavailable notice instead of discarding the result with a database error. This does not claim that the database has been repaired.

Verify npm ci, npm run build, input validation, an actual discovery request, enrichment, CSV export and small-phone layout. External OSM/websites can be unavailable or rate-limited.
