import path from 'node:path';
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // The engine ships TypeScript source (no build step); Next compiles it.
  transpilePackages: ['@daysoff/engine'],
  // PGlite is a WASM build used in dev/tests only; keep it out of the server bundle graph.
  serverExternalPackages: ['@electric-sql/pglite'],
  poweredByHeader: false,
  // Monorepo: trace from the repo root so the engine package and the committed holiday
  // snapshots (read with fs at runtime) ship with the deployment.
  outputFileTracingRoot: path.join(import.meta.dirname, '..', '..'),
  outputFileTracingIncludes: { '/**': ['../../public/holidays/**', './samples/**'] },
};

export default nextConfig;
