import path from 'node:path';
import type { NextConfig } from 'next';

const dev = process.env.NODE_ENV !== 'production';

/*
 * Security headers on every response. The CSP allows inline scripts and styles because Next's
 * streaming runtime injects them; everything else is same-origin only. Framing is refused.
 */
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${dev ? " 'unsafe-eval'" : ''}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
  "font-src 'self'",
  `connect-src 'self'${dev ? ' ws:' : ''}`,
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self' https://slack.com",
  "object-src 'none'",
].join('; ');

const securityHeaders = [
  { key: 'Content-Security-Policy', value: csp },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), payment=()' },
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains' },
];

const nextConfig: NextConfig = {
  async headers() {
    return [{ source: '/:path*', headers: securityHeaders }];
  },
  // The engine ships TypeScript source (no build step); Next compiles it.
  transpilePackages: ['@daysoff/engine'],
  // PGlite is a WASM build for dev, tests and demo-only deploys (no DATABASE_URL); keep it out of the server bundle graph.
  serverExternalPackages: ['@electric-sql/pglite'],
  poweredByHeader: false,
  // Monorepo: trace from the repo root so the engine package and the committed holiday
  // snapshots (read with fs at runtime) ship with the deployment. The SQL migrations are read
  // at runtime too (auto-migration, /status), and PGlite loads its WASM and data files by path.
  outputFileTracingRoot: path.join(import.meta.dirname, '..', '..'),
  outputFileTracingIncludes: {
    '/**': ['../../public/holidays/**', './samples/**', './drizzle/**', '../../node_modules/@electric-sql/pglite/dist/*.{js,cjs,wasm,data}'],
  },
};

export default nextConfig;
