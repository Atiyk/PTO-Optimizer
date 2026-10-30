import type { NextRequest } from 'next/server';

/**
 * CSRF check for cookie-authenticated POSTs. Browsers send Origin on cross-site POSTs and
 * Sec-Fetch-Site everywhere modern; refuse when either says the request came from elsewhere.
 * (Server actions get the same check from Next itself.)
 */
export function sameOrigin(request: NextRequest): boolean {
  const origin = request.headers.get('origin');
  if (origin) return origin === request.nextUrl.origin;
  const site = request.headers.get('sec-fetch-site');
  return site == null || site === 'same-origin' || site === 'none';
}
