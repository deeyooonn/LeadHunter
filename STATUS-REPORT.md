> Historical snapshot from before the location and scraper rewrite. See [LeadHunter_CONTEXT.md](LeadHunter_CONTEXT.md) for the current implementation.

# LeadHunter — GitHub Connection & Project Status

**Report date:** 2026-10-10  
**Repository:** [deeyooonn/Client-Scrapper](https://github.com/deeyooonn/Client-Scrapper)  
**Local branch:** `main`

## Executive summary

The project is connected to its GitHub repository through the `origin` remote. I verified the remote by fetching from GitHub; the fetch succeeded, `main` tracks `origin/main`, and the local branch was up to date before this report was added. The worktree was clean at that point.

The application is a Next.js lead-discovery and contact-enrichment dashboard. Its production build succeeds. Build output reported five existing unused-variable lint warnings; those warnings do not prevent compilation or type checking. The configured Supabase database, applied migration state, and live third-party API behavior were not independently verified.

## GitHub connection and actions taken

- Verified `origin` uses `https://github.com/deeyooonn/Client-Scrapper.git` for fetch and push.
- Confirmed the current branch is `main`, tracking `origin/main`, with push and pull configured for `main`.
- Ran `git fetch origin` successfully and checked the live remote tracking status. GitHub reported `main` up to date.
- Confirmed the project’s `.env` file is ignored by Git and is not tracked. Its values are not included in this report.
- Ran `npm run build` to validate the application.
- Added this report as the only project-file change for this request.

This report is included in the final `main` branch update pushed to `origin`.

## How the application works

1. **Choose a search.** The dashboard supports Philippine province/city/category dropdowns and a freeform location query. The page sends a `POST` request to `/api/discover`.
2. **Resolve the area.** The discovery API uses OpenStreetMap Nominatim to geocode the requested place. When Nominatim provides an administrative OSM relation or way, the app derives its exact area ID; otherwise it uses the returned bounding box. If geocoding fails or returns no result, the current implementation falls back to a Bulacan bounding box.
3. **Find businesses.** The API builds an Overpass QL query from the selected business category and queries public Overpass instances sequentially, failing over to another mirror when one fails. It maps named OSM elements into lead records, captures available contact/address details, and creates map links from coordinates.
4. **Save and deduplicate leads.** Leads are upserted into Supabase in batches of 100, keyed by the unique `place_id` (`osm_node_*`, `osm_way_*`, or `osm_relation_*`). If the database upsert fails, the current implementation can return temporary in-memory records with a migration warning; this fallback does not establish durable storage.
5. **Enrich a lead.** An individual action or “Enrich All” sends `POST /api/enrich`. The server fetches the business website with a 10-second timeout, parses its HTML with Cheerio, looks for email addresses and Facebook/Instagram links, classifies an unreachable site as `DEAD_LINK`, and updates the lead in Supabase. Bulk enrichment is performed one lead at a time.
6. **Review and export.** The dashboard provides search/status filters, summary counts, progress feedback, and a CSV download of the displayed discovery results, including contact and website fields.

## Technology and repository contents

- **Application:** Next.js App Router, React, and TypeScript.
- **UI:** Tailwind CSS, custom CSS, and Lucide React icons.
- **Data:** Supabase PostgreSQL, accessed using browser and server clients.
- **Discovery:** OpenStreetMap Nominatim and Overpass APIs.
- **Enrichment:** Server-side fetch and Cheerio HTML parsing.
- **Main files:** `app/page.tsx` (dashboard), `app/api/discover/route.ts` (discovery), `app/api/enrich/route.ts` (scraping), `lib/locations.ts` (location/category data), `lib/supabase.ts` (Supabase clients), `types/lead.ts` (data types), and `supabase/migrations/001_create_leads.sql` (database schema).
- **Useful scripts:** `npm run dev`, `npm run build`, `npm run start`, and `npm run lint`.

## Database and configuration status

The app expects these environment variables, supplied locally rather than committed: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY`. The tracked `.env.example` provides placeholders; local `.env` is ignored.

The migration creates the `leads` table, a unique `place_id`, website-status validation, indexes, and Row Level Security policies. I cannot confirm from Git or a successful local build whether this migration has been run against the configured Supabase project. The migration currently includes broad policies (including anonymous read access and an all-operations policy); review and restrict database access before using sensitive or production data.

## Verification and known follow-ups

- **Production build:** `npm run build` completed successfully, including compilation, linting, type validation, and static-page generation.
- **Warnings:** ESLint reported five unused-variable warnings: four destructured bounding-box values in `app/api/discover/route.ts` and the `ChevronDown` import in `app/page.tsx`.
- **Tests:** `package.json` does not define a test script; no automated test suite was run.
- **External integrations:** Build success does not verify Supabase connectivity, database schema availability, or live Nominatim/Overpass/target-site responses.
- **Recommended next checks:** Confirm the migration is applied to the intended Supabase project, review/limit its RLS policies, and run a real discovery plus enrichment from the app.

## Final GitHub sync

The report is tracked on `main` and pushed to `origin/main`. The final verification confirmed that the local branch and GitHub branch are up to date and that the worktree is clean.
