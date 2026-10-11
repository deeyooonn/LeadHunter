# LeadHunter

Find businesses inside a Philippine province, city, or municipality, then collect public contact details from their websites. Built with Next.js, React, strict TypeScript, and Cheerio. No database is required or used.

## Start

Requires Node.js 22 or newer.

```sh
npm ci
npm run dev
```

Open `http://localhost:3000`. The app works without database credentials. Select a location using the local suggestions or type one, choose a result limit, and discover businesses. The matched boundary is shown above the results. An unresolved location produces an error; there is no default region.

Scan a website individually, or scan visible unscanned businesses with two workers. Stop cancels active requests and keeps completed results. Temporarily cached scans are reused until you explicitly choose Rescan, the entry is evicted, or the server restarts. The scraper collects multiple phones, emails, Facebook pages and other social profiles, and reports a specific outcome with a reason. Social pages are recorded rather than scraped.

Dark mode is the default. The theme toggle persists the choice and restores it before the first paint. Contact and status filters apply to both the table and CSV export. CSV cells escape quotes, neutralize spreadsheet formulas and mark phone columns as text; an apostrophe may appear in raw CSV viewers. For Excel, importing the phone column as Text also preserves formatting.

## Temporary results and CSV export

Results are kept in memory. Export CSV to save a permanent copy before closing or refreshing the page. There is no database connection, credential setup, or migration step.

- Up to eight discovery searches are cached for ten minutes.
- Up to 500 website scans are cached for the server process lifetime. Repeated searches restore matching cached scans by website URL. Rescans retain previously collected contacts if a later attempt fails.
- Restarting the server clears both caches. Browser refresh clears the visible table; repeating a search can restore results while its cache remains available.

Old database environment variables are ignored. Legacy SQL migration files remain as historical references and are not run by the app.

## Optional rescue and access settings

Copy any settings you need from `.env.example` into `.env.local`.

- Archive rescue is enabled for unreadable sites; `SCRAPER_ARCHIVE_ENABLED=false` disables it. Contacts from snapshots are labelled as potentially outdated.
- `SCRAPER_RENDERER_URL` enables the optional renderer checkbox. The endpoint must accept a JSON POST with a `url` field and return HTML. Requests occur only for JavaScript-only sites after the user opts in. This shares public business URLs with the configured provider. That provider must enforce SSRF checks for all navigation and subresources.
- `LEADHUNTER_API_TOKEN` protects discovery and scanning with a shared access key; the dashboard prompts for it and holds it in memory. Configure authentication before exposing this application publicly. In-process throttles are intended for a local/single-process deployment; multiple instances require shared rate limits.

All server HTTP requests use public-address validation, pinned DNS results, redirect revalidation, body-size caps and timeouts. The scraper never disables TLS verification, impersonates search-engine crawlers, or bypasses CAPTCHAs.

## Checks

```sh
npm run typecheck
npm run lint
npm run build
npm test
npm run test:browser
```

Run build and type-check sequentially because Next regenerates `.next/types`. Browser tests use installed Microsoft Edge headlessly; adjust `playwright.config.ts` if you use another browser. Browser tests mock APIs. Screenshots are written to `artifacts/`.

`npm run verify:location` makes a small read-only live check of Cavite, Quezon City and Quezon province, then verifies returned Cavite business coordinates. Provider outages cause the command to fail; it does not substitute locations. The real Cavite boundary is also covered by offline tests.

## Coverage and service limits

Discovery uses OpenStreetMap, not Google Maps. Coverage is uneven and Facebook-only/unmapped businesses may be absent. Large-area searches can exceed public service limits. The app explains failures and suggests a smaller area.

Searches select nearby map objects before applying business filters. Larger areas are searched in small sections, starting near the bounding-box center, until the result limit or a 50-second map-search budget is reached. All returned coordinates are checked against the exact selected boundary. If a provider fails after some sections succeed, those results remain visible with a partial-search warning and are not cached as a completed search.

Nominatim requests are serialized at least 1.1 seconds apart; suggestions are local and never call its autocomplete API. Developers using the public endpoint must follow the [Nominatim usage policy](https://operations.osmfoundation.org/policies/nominatim/). OSM data is [© OpenStreetMap contributors, ODbL](https://www.openstreetmap.org/copyright).

See [repository context](LeadHunter_CONTEXT.md) and the [implementation and verification plan](IMPLEMENTATION_PLAN.md) for the current architecture, invariants and unverified external integrations. `SUMMARY.md` and `STATUS-REPORT.md` are historical snapshots.
