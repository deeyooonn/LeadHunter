import { NextResponse } from 'next/server';
export function GET() {
  return NextResponse.json({ rendererAvailable: Boolean(process.env.SCRAPER_RENDERER_URL), authRequired: Boolean(process.env.LEADHUNTER_API_TOKEN) });
}
