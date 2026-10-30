import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // The engine ships TypeScript source (no build step); Next compiles it.
  transpilePackages: ['@daysoff/engine'],
  // PGlite is a WASM build used in dev/tests only; keep it out of the server bundle graph.
  serverExternalPackages: ['@electric-sql/pglite'],
  poweredByHeader: false,
};

export default nextConfig;
