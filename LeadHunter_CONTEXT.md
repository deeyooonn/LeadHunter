# LeadHunter repository context

The original brief was read from `C:/Users/diond/Downloads/LeadHunter_CONTEXT.md`; it remains unchanged. This file describes the implemented repository.

## Architecture

- Next.js App Router, React, strict TypeScript, Cheerio. Database integration has been removed; results use temporary process-local caches and CSV export.
- `app/page.tsx`: location search, matched boundary, contact table, filters, scan/rescan, two-worker bulk queue with stop, filtered CSV.
- `app/layout.tsx`, `app/globals.css`, `app/components/`: dark default, inline prepaint theme restoration, light theme, responsive presentation.
- `lib/geocoding.ts`, `lib/geometry.ts`, `lib/overpass.ts`: Philippine polygon selection, exact name/admin ranking, point containment including multipolygon holes, all-business query.
- `lib/safe-fetch.ts`: shared public-address/DNS/redirect guard with socket pinning and bounded responses.
- `lib/scraper/parse.ts`: multiple emails/phones/social profiles from structured data, microdata, links, visible text, obfuscation, Facebook widgets and bounded source scans.
- `lib/scraper/scan.ts`: normalization, social-only shortcut, guarded request variants, contact-page crawl, optional archive/renderer rescue, outcomes with reasons. Only escalate when earlier layers find no contacts.
- `lib/lead-store.ts`: eight-entry ten-minute discovery cache and 500-entry website scan cache. Restores scan details on rediscovery and preserves contacts after failed rescans. Both caches clear on server restart.
- `supabase/migrations/`: historical SQL files only; no database client or database operations remain in the app.

## Invariants

1. Never select a default/fallback geographic region. Reject unresolved/ambiguous/nonpolygon locations. Verify all result coordinates before displaying or saving.
2. No category filter exists; derived category labels remain useful result data.
3. Every server HTTP request uses the SSRF guard. DNS answers must all be public and the socket uses a checked address; redirects repeat validation. Do not weaken TLS verification.
4. No `any` types. Untrusted JSON starts as `unknown` at the request boundary.
5. Discovery never writes scraped contacts, scan outcomes, legacy contact columns, or outreach flags. New OSM contacts and scraped contacts remain separate and merge for display.
6. No CAPTCHA/challenge bypass, crawler impersonation, or Facebook scraping. Archive contacts are labelled historical. Renderer use is off unless configured and explicitly enabled in the UI.
7. No database is used. Existing database credentials are ignored. Export CSV for permanent storage; temporary results do not survive a server restart.
8. No deployments or live migrations were performed. Public deployment needs authentication and suitable shared rate limits.

## Verification

Tests cover exact location ranking, city/province distinctions, parent constraints, nonsense rejection, polygons/holes and real Cavite geometry, business-query containment, phone/social/email parsing, scraper outcomes/layer order, archive/renderer fixtures, SSRF address and redirect checks, body limits, descriptive-only writes, and CSV safety. Browser tests cover persisted themes before first frame, search and scan display, filtered export, stale-result clearing, bulk stop, and mobile overflow.

Live geocoding resolved Cavite to `relation/1503544`, Quezon City to `relation/106569`, and Quezon province to `relation/1504500`. The real Cavite polygon is retained in `tests/fixtures/cavite-boundary.json` with OSM attribution. It includes test points in Imus/Dasmariñas and excludes Quezon City, Calamba, and Tanauan. Live Overpass calls encountered provider errors/timeouts; successful live business results remain unverified. See `IMPLEMENTATION_PLAN.md` for reproducible commands and configuration.

## Limits

OSM coverage varies; there is no Google Maps discovery API. Website owners may block requests, and JavaScript-only sites may need the optional renderer. The scraper uses a 45-second total budget, bounded per-request time, two megabytes per page, and up to five contact-like pages. Geographic query limits cap returned results; they do not represent an exhaustive inventory. Live Supabase migration/persistence and a real third-party renderer have not been verified.
