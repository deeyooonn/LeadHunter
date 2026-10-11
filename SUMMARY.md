> Historical snapshot from before the location and scraper rewrite. See [LeadHunter_CONTEXT.md](LeadHunter_CONTEXT.md) for the current implementation.

# 📋 Project Summary: LeadHunter (Client Scrapper)

**Local Lead Generation & Info Collector Tool**  
Built with **Next.js 15 (App Router)**, **TypeScript**, **Tailwind CSS**, **Supabase**, **OpenStreetMap (Nominatim + Overpass API)**, and **Cheerio**.

> **100% Free & Open Source**: No Google Cloud account, no credit card, and no paid API keys required.

---

## 🚀 Overview & Accomplishments

LeadHunter is a production-ready, dark-mode web application that automates local business discovery and lead generation:
1. **Free Discovery**: Uses OpenStreetMap's Nominatim geocoder and Overpass QL API to discover local businesses (restaurants, salons, clinics, cafes, dentists, etc.) across **all 81 provinces of the Philippines + Metro Manila (NCR)** with their respective cities and municipalities.
2. **Online Presence Categorization**: Classifies businesses as having `CUSTOM_WEBSITE`, `FB_ONLY`, `NO_WEBSITE`, or `DEAD_LINK`.
3. **Automated Scraping**: Uses Cheerio with specialized multi-tier heuristics to extract emails and Facebook/Instagram profile links directly from target websites.
4. **Database Storage**: Seamlessly stores and deduplicates records into Supabase PostgreSQL via `place_id`.
5. **Modern Dashboard**: Features real-time counters, search & status filters, single & bulk enrichment with progress feedback, one-click copy, and full CSV export.

---

## 🗂 Project File Structure & Inventory

```
c:\Users\diond\Downloads\Client Scrapper\
├── app/
│   ├── api/
│   │   ├── discover/
│   │   │   └── route.ts              # OSM Discovery: Nominatim Geocoding + Overpass API + Supabase upsert
│   │   └── enrich/
│   │       └── route.ts              # Website Scraping: Cheerio email & social link extraction
│   ├── globals.css                   # Custom theme styles, glowing badges, dark mode tokens
│   ├── layout.tsx                    # Root layout with Inter font and metadata
│   └── page.tsx                      # Dashboard UI (Search, Filter, Metrics, Enrich All, CSV Export)
├── lib/
│   ├── locations.ts                  # Dropdown filter datasets (Provinces, Cities, Business Categories)
│   └── supabase.ts                   # Supabase clients (browser anon client + server service-role client)
├── supabase/
│   └── migrations/
│       └── 001_create_leads.sql      # PostgreSQL schema, ENUMs, indexes, RLS policies, update triggers
├── types/
│   └── lead.ts                       # TypeScript definitions (Lead, WebsiteStatus, API payloads)
├── .env                              # Active environment variables (Supabase URL & API keys configured)
├── .eslintrc.json                    # ESLint configuration
├── .gitignore                        # Git ignore rules
├── next.config.js                    # Next.js 15 configuration (serverExternalPackages: ['cheerio'])
├── package.json                      # Dependencies and scripts (Next 15.3.4, React 19, Cheerio, Lucide)
├── postcss.config.js                 # Tailwind CSS PostCSS config
├── README.md                         # Quick start documentation
├── SUMMARY.md                        # Complete project summary & reference guide (this file)
└── tsconfig.json                     # TypeScript compiler configuration
```

---

## ⚙️ Architectural Highlights

### 1. Database Schema (`supabase/migrations/001_create_leads.sql`)
- **Table:** `leads`
- **Fields:**
  - `id` (UUID, primary key)
  - `place_id` (Text, UNIQUE) — e.g., `osm_node_12345678` or Google ID; guarantees deduplication
  - `business_name` (Text)
  - `address` (Text)
  - `phone` (Text, nullable)
  - `google_maps_url` (Text, nullable) — deep link to coordinates or place
  - `website_url` (Text, nullable)
  - `email` (Text, nullable)
  - `facebook_url` (Text, nullable)
  - `instagram_url` (Text, nullable)
  - `website_status` (ENUM: `NO_WEBSITE`, `FB_ONLY`, `CUSTOM_WEBSITE`, `DEAD_LINK`)
  - `outreached` (Boolean, default `false`)
  - `created_at` & `updated_at` (Timestamps with auto-update trigger)
- **Security & Speed:** Row Level Security (RLS) enabled with read/write access policies and indexes on `place_id`, `website_status`, and `business_name`.

### 2. Free Discovery Engine (`app/api/discover/route.ts`)
- **Nominatim Geocoding**: Translates any natural language query (e.g. "Salons in Bulacan" or "Restaurants in Austin") into a geographic bounding box `[south, north, west, east]`.
  - Fallback: Gracefully defaults to Bulacan coordinates if Nominatim finds no matches.
- **Overpass QL Engine**: Queries public OpenStreetMap servers for commercial nodes and ways:
  - Amenities: `restaurant`, `cafe`, `clinic`, `dentist`, `beauty`, `fast_food`, `bar`, `pub`, `pharmacy`, `hospital`.
  - Shops: `hairdresser`, `beauty`, `salon`, `cosmetics`, `health_food`, `optician`, `massage`.
- **Data Normalization**: Generates clean addresses from `addr:*` tags, parses contact phones/websites, classifies website status, and batch-upserts into Supabase in chunks of 100.

### 3. Website Scraper & Enricher (`app/api/enrich/route.ts`)
- Server-side scraper using Cheerio with a 10s timeout and browser User-Agent.
- Handles dead or invalid domains by marking them `DEAD_LINK`.
- **Three-tier email extraction heuristic**:
  1. `mailto:` links inside anchor tags.
  2. Footer and contact sections (`<footer>`, `[id*="contact"]`, `[class*="contact"]`, etc.).
  3. Body regex scan excluding image file false positives (`.png`, `.jpg`, `.svg`).
- **Social links**: Discovers Facebook and Instagram pages.
- Updates Supabase immediately and returns the enriched data.

### 4. Interactive Dashboard (`app/page.tsx`)
- **Quick-pick Queries**: Clickable chips for common searches.
- **Real-Time Metrics**: Total Leads, Emails Discovered, Social Profiles Found, and Website Status breakdown.
- **Filtering & Search**: Status filters (`ALL`, `CUSTOM_WEBSITE`, `NO_WEBSITE`, `FB_ONLY`, `DEAD_LINK`) + live client-side text search.
- **Bulk & Individual Scraping**:
  - Individual "Enrich" button per row with spinner.
  - "Enrich All" batch runner with real-time percentage progress bar.
- **Actions**: One-click copy for email and phone numbers, plus one-click CSV export of all leads.

---

## 🔑 Environment Configuration

Your `.env` file is currently configured with your live Supabase credentials:
```env
NEXT_PUBLIC_SUPABASE_URL=https://wmqsqvupaaodvcvekryg.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1Ni...
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1Ni...
```

> **Note on Google Places**: Because the discovery engine was upgraded to OpenStreetMap, `GOOGLE_PLACES_API_KEY` is completely optional and no longer required!

---

## 📋 What Needs to Be Done (Manual Steps)

1. **Execute the Supabase SQL Migration** (if you haven't yet):
   - Go to [Supabase Dashboard](https://supabase.com/dashboard) ➔ select project `wmqsqvupaaodvcvekryg`
   - Open **SQL Editor** ➔ **New Query**
   - Copy and paste `supabase/migrations/001_create_leads.sql`
   - Click **Run**

2. **Test the Application**:
   - The dev server is running on [http://localhost:3000](http://localhost:3000).
   - Enter a search query like `Salons in Bulacan` or `Cafes in Manila` and click **Search Leads**.
   - Review the leads, click **Enrich** or **Enrich All**, and export to CSV.

3. **Push to GitHub**:
   ```bash
   git init
   git add .
   git commit -m "feat: complete LeadHunter with OpenStreetMap & Cheerio enrichment"
   git remote add origin https://github.com/deeyooonn/Client-Scrapper.git
   git branch -M main
   git push -u origin main
   ```
