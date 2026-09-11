import { NextRequest, NextResponse } from 'next/server';
import * as cheerio from 'cheerio';
import type { WebsiteStatus, EnrichResponse } from '@/types/lead';
import { supabaseServer } from '@/lib/supabase';

const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

const EMAIL_REGEX = /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g;

/**
 * Fetch a URL with a timeout and User-Agent header
 */
async function fetchWithTimeout(url: string, timeoutMs = 10000): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': USER_AGENT,
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
        'Accept-Encoding': 'gzip, deflate',
        Connection: 'keep-alive',
      },
      redirect: 'follow',
    });
    return response;
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Normalize a URL — prepend https if no protocol present
 */
function normalizeUrl(url: string): string {
  if (url.startsWith('http://') || url.startsWith('https://')) return url;
  return `https://${url}`;
}

/**
 * Extract the first valid email from HTML using Cheerio + Regex
 */
function extractEmail($: cheerio.CheerioAPI): string | null {
  // Priority 1: mailto: links
  const mailtoEmails: string[] = [];
  $('a[href^="mailto:"]').each((_, el) => {
    const href = $(el).attr('href') ?? '';
    const email = href.replace('mailto:', '').split('?')[0].trim();
    if (email && EMAIL_REGEX.test(email)) {
      mailtoEmails.push(email);
    }
    EMAIL_REGEX.lastIndex = 0; // Reset regex state
  });

  if (mailtoEmails.length > 0) return mailtoEmails[0];

  // Priority 2: Scan footer / contact sections for plain-text email patterns
  const sectionsToSearch = [
    'footer',
    '#footer',
    '.footer',
    '#contact',
    '.contact',
    '[class*="contact"]',
    '[id*="contact"]',
    '[class*="footer"]',
  ];

  for (const selector of sectionsToSearch) {
    const text = $(selector).text();
    if (text) {
      const matches = text.match(EMAIL_REGEX);
      if (matches && matches.length > 0) return matches[0];
    }
  }

  // Priority 3: Full body scan as last resort (grab first email found)
  const bodyText = $('body').text();
  const bodyMatches = bodyText.match(EMAIL_REGEX);
  if (bodyMatches && bodyMatches.length > 0) {
    // Filter out common false positives
    const filtered = bodyMatches.filter(
      (email) =>
        !email.includes('example.com') &&
        !email.includes('sentry.io') &&
        !email.endsWith('.png') &&
        !email.endsWith('.jpg')
    );
    return filtered[0] ?? null;
  }

  return null;
}

/**
 * Extract the first Facebook and Instagram URL from all hrefs
 */
function extractSocialLinks($: cheerio.CheerioAPI): {
  facebook_url: string | null;
  instagram_url: string | null;
} {
  let facebook_url: string | null = null;
  let instagram_url: string | null = null;

  $('a[href]').each((_, el) => {
    const href = $(el).attr('href') ?? '';

    if (!facebook_url && href.includes('facebook.com/')) {
      // Normalize and clean the URL
      try {
        const url = new URL(href.startsWith('http') ? href : `https:${href}`);
        facebook_url = url.href;
      } catch {
        facebook_url = href;
      }
    }

    if (!instagram_url && href.includes('instagram.com/')) {
      try {
        const url = new URL(href.startsWith('http') ? href : `https:${href}`);
        instagram_url = url.href;
      } catch {
        instagram_url = href;
      }
    }

    // Early exit once we have both
    if (facebook_url && instagram_url) return false;
  });

  return { facebook_url, instagram_url };
}

/**
 * POST /api/enrich
 * Body: { lead_id: string, website_url: string }
 * Fetches and scrapes the website, then updates the lead in Supabase
 */
export async function POST(request: NextRequest) {
  let lead_id = '';
  let website_url = '';

  try {
    const body = await request.json();
    lead_id = body.lead_id as string;
    website_url = body.website_url as string;

    if (!lead_id || !website_url) {
      return NextResponse.json(
        { error: 'lead_id and website_url are required' },
        { status: 400 }
      );
    }

    const normalizedUrl = normalizeUrl(website_url);

    // ── Attempt to fetch the website ─────────────────────────────────────────
    let html: string;
    let website_status: WebsiteStatus = 'CUSTOM_WEBSITE';

    try {
      const response = await fetchWithTimeout(normalizedUrl, 10000);

      if (!response.ok) {
        console.warn(`[enrich] Non-OK response for ${normalizedUrl}: ${response.status}`);
        website_status = 'DEAD_LINK';

        // Update DB and return early
        await supabaseServer
          .from('leads')
          .update({ website_status })
          .eq('id', lead_id);

        const result: EnrichResponse = {
          email: null,
          facebook_url: null,
          instagram_url: null,
          website_status,
        };
        return NextResponse.json(result);
      }

      html = await response.text();
    } catch (fetchError) {
      // Network error, timeout, etc.
      const message =
        fetchError instanceof Error ? fetchError.message : 'Unknown fetch error';
      console.warn(`[enrich] Fetch failed for ${normalizedUrl}: ${message}`);
      website_status = 'DEAD_LINK';

      await supabaseServer
        .from('leads')
        .update({ website_status })
        .eq('id', lead_id);

      const result: EnrichResponse = {
        email: null,
        facebook_url: null,
        instagram_url: null,
        website_status,
        error: `Website unreachable: ${message}`,
      };
      return NextResponse.json(result);
    }

    // ── Parse with Cheerio ────────────────────────────────────────────────────
    const $ = cheerio.load(html);

    const email = extractEmail($);
    const { facebook_url, instagram_url } = extractSocialLinks($);

    // ── Update the lead in Supabase ───────────────────────────────────────────
    const { error: dbError } = await supabaseServer
      .from('leads')
      .update({
        email,
        facebook_url,
        instagram_url,
        website_status,
      })
      .eq('id', lead_id);

    if (dbError) {
      console.error('[enrich] Supabase update error:', dbError);
      return NextResponse.json(
        { error: `Database error: ${dbError.message}` },
        { status: 500 }
      );
    }

    const result: EnrichResponse = {
      email,
      facebook_url,
      instagram_url,
      website_status,
    };

    return NextResponse.json(result);
  } catch (err) {
    console.error('[enrich] Unexpected error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'An unexpected error occurred' },
      { status: 500 }
    );
  }
}
