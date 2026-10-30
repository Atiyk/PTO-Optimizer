/** Public base URL (for OAuth redirects and invite links). */
export function appUrl(fallbackOrigin?: string): string {
  const u = process.env.APP_URL ?? (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : fallbackOrigin ?? 'http://localhost:3000');
  return u.replace(/\/$/, '');
}
