/** The caller's IP for rate limiting. On Vercel the first x-forwarded-for entry is set by the edge. */
export function clientIp(headers: Headers): string {
  return headers.get('x-real-ip') ?? headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown';
}
