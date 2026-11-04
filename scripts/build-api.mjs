/**
 * Bundles the server-side entry points under server/ into api/_bundle/*.mjs before Vercel
 * compiles api/. Vercel's Node runtime compiles each api/*.ts file on its own and keeps the
 * repo's extensionless relative imports ("../src/ui/icsExport"), which Node's ESM loader
 * cannot resolve at runtime. One self-contained bundle per entry avoids that, and keeps
 * the browser build (vite) untouched. Output is gitignored and rebuilt on every build.
 */
import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
await build({
  absWorkingDir: root,
  entryPoints: { feed: 'server/feedEntry.ts' },
  outdir: 'api/_bundle',
  outExtension: { '.js': '.mjs' },
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node22',
  tsconfig: 'tsconfig.app.json',
  logLevel: 'warning',
});
