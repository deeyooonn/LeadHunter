# Verification record

## Database removal (2026-10-11, Asia/Manila)

- Removed the Supabase runtime client, dependency, database operations, setup variables, and persistence warnings. Legacy SQL files and any external database data were left untouched.
- Discovery uses an eight-entry ten-minute memory cache. Website scans use a bounded 500-entry memory cache, preserve earlier contacts on failed rescans, and are restored by URL on rediscovery. Server restarts clear both caches; CSV export provides permanent copies.
- All 38 regression tests, all four browser tests (including scanning and CSV export), TypeScript, ESLint, and production build pass.
- Restarted the local app and verified the exact input `Metro Manila (NCR)`: HTTP 200, 100 businesses, 6.8 seconds, no warning returned.
- Entries below describe earlier revisions, including the now-removed database integration.

## Timeout fix follow-up (2026-10-11, Asia/Manila)

- Live application API: Cavite returned HTTP 200 with 100 businesses in 13.5 seconds. Imus returned HTTP 200 with 23 businesses in 14.6 seconds; repeating the same request returned the temporary cached result in 24 ms.
- Search now materializes nearby map objects before filtering tags, divides large areas into bounded sections, deduplicates results, and retains the exact polygon check. Provider failures after a successful section return an explicit partial-search warning; those searches are not cached as completed.
- Added an eight-entry, ten-minute temporary discovery cache independent of database persistence.
- All 35 regression tests, TypeScript, and ESLint pass. Production build and browser tests were not rerun for this backend follow-up; their earlier results below refer to the previous revision.
- Live responses still report unavailable database persistence. No schema or credential changes were made.
- Public-provider availability remains variable; successful live searches do not guarantee future uptime.

## Earlier verification

Branch: `fix/leadhunter-location-scraper`. Completed checks: 2026-10-11 (Asia/Manila).

- TypeScript: `npm run typecheck` passes.
- ESLint: `npm run lint` passes with zero lint warnings/errors. The installed Next.js version prints a `next lint` deprecation notice.
- Production compilation: `npm run build` passes.
- Automated regression tests: `npm test` passes all 27 tests.
- Browser tests: `npm run test:browser` passes all 3 tests in headless Microsoft Edge. APIs are mocked for deterministic UI checks and database writes are disabled.
- Desktop dark/light and mobile screenshots were generated and visually inspected in `artifacts/`.
- `git diff --check` reports no whitespace errors. Original migration 001 is unchanged.

## Cavite evidence

Live Nominatim requests resolved the following distinct administrative relations:

| Input | OSM relation |
| --- | --- |
| Cavite | 1503544 |
| Quezon City | 106569 |
| Quezon province | 1504500 |

The real Cavite polygon is stored in `tests/fixtures/cavite-boundary.json`. Tests include points in Imus and Dasmariñas and reject points in Quezon City, Calamba and Tanauan. Other tests supply out-of-area businesses to the discovery coordinate filter and verify they are removed, exercise multipolygon holes, rank an exact province above misleading candidates, distinguish city/province intent, and reject empty/nonsense searches without selecting a default region.

Live Overpass business queries failed with HTTP 500/504 responses. A diagnostic response explicitly reported an overloaded Overpass dispatcher. Consequently, a successful end-to-end live Cavite business response is **not verified**. `npm run verify:location` reproduces the live check, caches resolved polygons locally for seven days, and checks every returned business coordinate if the provider responds.

## Unverified integrations

- No live database rows or policies were changed. Migration 002 is supplied but has not been applied or tested against a live Supabase database. No-credentials and malformed-configuration behavior are tested.
- Archive rescue and the optional renderer are tested with fixtures; live archive retrieval and an actual renderer provider were not exercised.
- Contact-page, structured-data, obfuscation, WhatsApp, social-profile and scraper-status behavior are tested with controlled fixtures. No claim is made that all business websites will allow extraction.
- No deployment was performed. Existing data, migration 001, and the original brief outside this repository remain intact.
