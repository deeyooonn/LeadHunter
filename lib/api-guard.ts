import { NextRequest, NextResponse } from 'next/server';
export function rejectCrossSite(request: NextRequest): NextResponse | null {
  const site = request.headers.get('sec-fetch-site');
  if (site === 'cross-site') return NextResponse.json({ error: 'Cross-site requests are not accepted.' }, { status: 403 });
  const expected = process.env.LEADHUNTER_API_TOKEN;
  if (expected && request.headers.get('authorization') !== `Bearer ${expected}`) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
  return null;
}
