# LeadHunter implementation and verification

Work branch: `fix/leadhunter-location-scraper`.

1. Resolve a Philippine boundary before querying businesses (`lib/geocoding.ts`, `lib/geometry.ts`, discovery route). Rank exact normalized names, preserve city/province intent, reject missing/ambiguous/nonpolygon results, query the resolved area, then recheck every coordinate. No fallback region exists.
2. Remove category request fields and UI controls. `lib/overpass.ts` queries named shops, crafts, commercial offices, food/health venues, lodging and personal/fitness services; government/nonbusiness offices are excluded. Category labels are derived from OSM tags.
3. Route all server HTTP requests through `lib/safe-fetch.ts`: protocol/port checks, public-only DNS results, pinned socket address, redirect revalidation, bounded time and body sizes. Rebuild extraction and ordered rescue in `lib/scraper/`. Social sites are recorded without scraping them. CAPTCHA and browser challenges are never bypassed.
4. Preserve legacy fields. Discovery upserts descriptive fields and separately sourced OSM contacts. Scans persist separately and retain earlier collected contacts after failures. Supabase is optional; migration `002_contacts_and_caches.sql` adds cache/contact fields and removes the original public policies. Existing migration 001 and all rows remain intact.
5. Keep the dashboard structure while introducing theme tokens, prepaint persisted theme selection, local location suggestions, matched-area details, contact filters, clear scan outcomes, two-worker bulk scans with stop, mobile contact rows, and safe filtered CSV export.
6. Run unit/integration and browser checks, inspect desktop/light/mobile screenshots, and record remaining external-service limits.

## Run locally

```powershell
npm ci
npm run dev
```

The app works without database credentials. For persistence, back up your existing database and apply **only the new migration 002** to an existing installation. On a fresh database apply 001 and 002 in order. Configure the server URL and service-role key using `.env.example`. No live database migration was executed during this implementation.

## Verification commands

Run type-check before or after the build, never concurrently: the build rewrites `.next/types`.

```powershell
npm run typecheck
npm run lint
npm run build
npm test
npm run test:browser
```

Browser tests use installed Microsoft Edge in headless mode, start a local Next server on port 3210, disable database writes, and mock search/scan responses. On a machine without Edge, change the Playwright channel or install a supported browser. Screenshots are written under `artifacts/`.

```powershell
npm run verify:location
```

This optional live check calls Nominatim at a throttled rate, saves seven-day local verification fixtures, queries Cavite businesses, and asserts every returned coordinate is in Cavite and outside Quezon City. It never writes to Supabase. It fails visibly when a map service is unavailable. `scripts/diagnose-overpass.ts` makes one diagnostic query to report a provider error.

## Service responsibilities

- Nominatim suggestions are local data, never API autocomplete. Geocoding is serialized at least 1.1 seconds apart in a single process. Persistent discovery results expire after seven days. See the [Nominatim policy](https://operations.osmfoundation.org/policies/nominatim/).
- Scan results have no automatic expiry; use Rescan to refresh. Cached empty/blocked/error outcomes also require explicit rescan.
- Public hosting requires the access key or an authenticated reverse proxy, and centralized rate limits if more than one server process is used. The in-process limits are intended for this local workspace, not distributed public hosting.
- The optional renderer must enforce its own public-address restrictions, including subresources. No renderer was configured or contacted during verification.
- Overpass availability and OSM completeness are external constraints; a failed query never substitutes another location. Current public instances are documented in the [OSM instance list](https://wiki.openstreetmap.org/wiki/Overpass_API#Public_Overpass_API_instances).
