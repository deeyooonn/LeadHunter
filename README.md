# 🎯 LeadHunter — Local Lead Generation & Business Intelligence Tool

> A modern, full-stack lead discovery and contact enrichment dashboard powered by **OpenStreetMap (Nominatim + Overpass QL)**, **Cheerio**, **Next.js 15 (App Router)**, and **Supabase**.

[![Next.js](https://img.shields.io/badge/Next.js-15.3.4-black?style=flat-square&logo=next.js)](https://nextjs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0-blue?style=flat-square&logo=typescript)](https://www.typescriptlang.org/)
[![Tailwind CSS](https://img.shields.io/badge/TailwindCSS-3.4-38bdf8?style=flat-square&logo=tailwindcss)](https://tailwindcss.com/)
[![Supabase](https://img.shields.io/badge/Supabase-PostgreSQL-3ecf8e?style=flat-square&logo=supabase)](https://supabase.com/)
[![OpenStreetMap](https://img.shields.io/badge/OpenStreetMap-100%25%20Free-7ebd55?style=flat-square&logo=openstreetmap)](https://www.openstreetmap.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg?style=flat-square)](https://opensource.org/licenses/MIT)

---

## 🌟 Highlights

- **100% Free & Open Source**: Zero paid APIs, no Google Cloud account, and no credit card required.
- **Nationwide Philippine Coverage**: Built-in dropdown selection covering **all 81 provinces of the Philippines + Metro Manila (NCR)** with component cities and municipalities.
- **High-Resilience Overpass Discovery**: Automated multi-mirror failover across 4 public Overpass instances with non-recursive spatial queries to prevent 504 timeouts.
- **Automated Web Scraping**: Crawls business websites with Cheerio using a multi-tiered heuristic engine to extract verified email addresses and Facebook/Instagram links.
- **Live Status Classification**: Automatically detects online presence:
  - 🟢 `CUSTOM_WEBSITE` — Independent business website ready for scraping
  - 🔵 `FB_ONLY` — Uses a Facebook page as their primary online presence
  - 🔴 `NO_WEBSITE` — High-value prospect with no detected website
  - 🟡 `DEAD_LINK` — Broken domain or unreachable website
- **Batch Processing**: "Enrich All" concurrent scraper with real-time progress tracking.
- **CSV Export**: One-click download of all leads, contacts, and coordinates formatted as a spreadsheet.
- **Persistent Database**: Automatic deduplication on `place_id` backed by Supabase PostgreSQL.

---

## 🏛 Architecture & Data Flow

```
┌─────────────────────────────────────────────────────────────┐
│                       LEADHUNTER UI                         │
│  Dropdown Filters (Province, City, Category) / Text Search  │
└──────────────────────────────┬──────────────────────────────┘
                               │
                POST /api/discover { province, city, category }
                               │
                               ▼
┌─────────────────────────────────────────────────────────────┐
│                 NOMINATIM GEOCODING ENGINE                  │
│       Resolves location to geographic bounding box [S,N,W,E] │
└──────────────────────────────┬──────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────┐
│               OVERPASS QL + MULTI-MIRROR FAILOVER           │
│   Queries commercial nodes & ways with 'out center 150;'     │
│   • maps.mail.ru  • overpass-api.de  • kumi  • coffee       │
└──────────────────────────────┬──────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────┐
│                 SUPABASE POSTGRESQL DATABASE                │
│       Upserts leads with unique constraint on place_id       │
└──────────────────────────────┬──────────────────────────────┘
                               │
               User clicks "Enrich" or "Enrich All"
                               │
                               ▼
┌─────────────────────────────────────────────────────────────┐
│                  CHEERIO WEBSITE SCRAPER                    │
│   Priority 1: mailto: links inside <a> tags                 │
│   Priority 2: <footer>, contact, and about sections         │
│   Priority 3: Sanitized body regex scanning                 │
│   Socials: Facebook & Instagram profile URL extraction       │
└─────────────────────────────────────────────────────────────┘
```

---

## 🛠 Tech Stack

| Layer | Technology | Purpose |
|---|---|---|
| **Framework** | [Next.js 15](https://nextjs.org/) (App Router) | Server-side API routes & fast client hydration |
| **Language** | [TypeScript](https://www.typescriptlang.org/) | End-to-end type safety |
| **Styling** | [Tailwind CSS](https://tailwindcss.com/) + Vanilla CSS | Premium dark-mode glassmorphic theme |
| **Database** | [Supabase](https://supabase.com/) (PostgreSQL) | Lead storage, deduplication, and RLS security |
| **Geocoding** | [OpenStreetMap Nominatim](https://nominatim.org/) | Query-to-bounding-box geocoding |
| **Discovery** | [Overpass API](https://wiki.openstreetmap.org/wiki/Overpass_API) (Overpass QL) | Commercial point-of-interest discovery |
| **Scraper** | [Cheerio](https://cheerio.js.org/) | High-speed server-side HTML DOM parser |
| **Icons** | [Lucide React](https://lucide.dev/) | Modern UI icon set |

---

## 🚀 Quick Start

### 1. Clone the Repository
```bash
git clone https://github.com/deeyooonn/Client-Scrapper.git
cd Client-Scrapper
```

### 2. Install Dependencies
```bash
npm install --legacy-peer-deps
```

### 3. Configure Environment Variables
Create your `.env.local` file from the example template:
```bash
cp .env.example .env.local
```

Fill in your Supabase credentials:
```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
```

> **Note**: No Google Cloud API key is required. All discovery features run on OpenStreetMap out of the box.

### 4. Apply the Database Migration
In your **Supabase Dashboard** ➔ **SQL Editor** ➔ **New query**, run the contents of:
```sql
supabase/migrations/001_create_leads.sql
```
*(This sets up the `leads` table, custom ENUMs, automatic timestamp triggers, and Row Level Security).*

### 5. Launch the App
```bash
npm run dev
```
Open [http://localhost:3000](http://localhost:3000) in your browser.

---

## 📋 API Reference

### 1. Discover Leads
**`POST /api/discover`**

Discovers businesses within a specific area and category using OpenStreetMap.

**Payload:**
```json
{
  "province": "Bulacan",
  "city": "Marilao",
  "businessType": "salons"
}
```
*Or freeform search:*
```json
{
  "searchQuery": "Restaurants in Makati City"
}
```

**Response:**
```json
{
  "leads": [
    {
      "id": "uuid",
      "place_id": "osm_node_12345678",
      "business_name": "Sir George's Salon",
      "address": "Marilao, Bulacan, Central Luzon, 3019, Philippines",
      "phone": "+63 44 123 4567",
      "website_status": "CUSTOM_WEBSITE",
      "website_url": "https://example.com",
      "google_maps_url": "https://www.google.com/maps/search/?api=1&query=14.75,120.95",
      "email": null,
      "facebook_url": null,
      "instagram_url": null,
      "outreached": false
    }
  ]
}
```

---

### 2. Enrich Lead
**`POST /api/enrich`**

Crawls the target website for emails and social handles.

**Payload:**
```json
{
  "lead_id": "uuid",
  "website_url": "https://example.com"
}
```

**Response:**
```json
{
  "email": "contact@example.com",
  "facebook_url": "https://facebook.com/example",
  "instagram_url": "https://instagram.com/example",
  "website_status": "CUSTOM_WEBSITE"
}
```

---

## 📂 Project Structure

```
Client-Scrapper/
├── app/
│   ├── api/
│   │   ├── discover/
│   │   │   └── route.ts         # Nominatim geocoding & Overpass multi-mirror discovery
│   │   └── enrich/
│   │       └── route.ts         # Cheerio website scraping & contact extraction
│   ├── globals.css              # Custom dark-theme CSS variables & select styling
│   ├── layout.tsx               # Root layout & Inter font
│   └── page.tsx                 # Full interactive dashboard
├── lib/
│   ├── locations.ts             # All 81 PH provinces + NCR & business category registries
│   └── supabase.ts              # Browser & server Supabase client instances
├── supabase/
│   └── migrations/
│       └── 001_create_leads.sql # PostgreSQL schema, ENUMs, triggers, and RLS
├── types/
│   └── lead.ts                  # TypeScript interfaces and API payload types
├── .env.example                 # Template environment configuration (no secrets)
├── .gitignore                   # Excludes .env, .env*.local, node_modules, .next
├── next.config.js               # Next.js 15 configuration
├── package.json                 # Project dependencies & scripts
├── SUMMARY.md                   # Detailed technical build reference
└── README.md                    # Project documentation
```

---

## 🔒 Privacy & Security

- All local environment files (`.env`, `.env*.local`) are ignored by git and never committed.
- Supabase Row Level Security (RLS) protects the leads table.
- Cheerio scraper enforces a strict 10-second timeout to prevent server hanging.

---

## 📝 License

Distributed under the MIT License. Feel free to fork and adapt for your own lead generation workflows!
