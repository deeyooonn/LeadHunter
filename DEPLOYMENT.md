# Vercel deployment
Import deeyooonn/LeadHunter (renamed from Client-Scrapper), root ".", Next.js, Node 22.x. vercel.json uses npm ci and npm run build. No environment variables are required for the default portfolio demo.

NEXT_PUBLIC_PORTFOLIO_DEMO=true (also the default when unset) returns synthetic discovery/enrichment data. No live scraping, external outreach, or Supabase access occurs in this mode. Fictional company names and example.com email addresses are clearly labeled. Filters, detail views, enrichment and CSV export can be explored through the existing UI.

Verify: npm ci, npm run build, npm start. Discover sample leads, filter results, inspect a lead, enrich it, and export CSV. Test phone and desktop layouts.

Setting NEXT_PUBLIC_PORTFOLIO_DEMO=false restores the original live workflow. That requires the Supabase schema and server credentials in the original README, and a separate review of live scraping behavior; it is not part of this demo deployment. Never expose SUPABASE_SERVICE_ROLE_KEY with a NEXT_PUBLIC_ prefix.

After verifying the public demo URL, set VITE_DEMO_LEADHUNTER_URL in Portfolio-Website and redeploy it.
