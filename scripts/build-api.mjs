/**
 * Bundles the server-side entry points under server/ into api/_bundle/*.mjs before Vercel
 * compiles api/. Vercel's Node runtime compiles each api/*.ts file on its own and keeps the
 * repo's extensionless relative imports ("../src/ui/icsExport"), which Node's ESM loader
 * cannot resolve at runtime. One self-contained bundle per entry avoids that, and keeps
 * the browser build (vite) untouched. Output is gitignored and rebuilt on every build.
 */
import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = fileURLToPath(new URL('..', import.meta.url));

/** Vercel doesn't ship public/ to functions, so the committed holiday files (about 2 MB of
 * JSON, 84 KB gzipped) are embedded in the bundle in place of server/holidayData.ts. */
const embedHolidays = {
  name: 'embed-holidays',
  setup(b) {
    b.onResolve({ filter: /\/holidayData$/ }, () => ({ path: 'holidayData', namespace: 'embedded-holidays' }));
    b.onLoad({ filter: /.*/, namespace: 'embedded-holidays' }, () => {
      const dir = join(root, 'public', 'holidays');
      const files = Object.fromEntries(readdirSync(dir).filter((name) => /^[A-Z]{2}-\d{4}\.json$/.test(name))
        .map((name) => [name, JSON.parse(readFileSync(join(dir, name), 'utf8'))]));
      return {
        loader: 'js',
        contents: `const files = ${JSON.stringify(files)};\nexport async function loadHolidayFile(name) { return Object.prototype.hasOwnProperty.call(files, name) ? files[name] : null; }\n`,
      };
    });
  },
};
await build({
  absWorkingDir: root,
  entryPoints: { feed: 'server/feedEntry.ts', account: 'server/accountEntry.ts' },
  outdir: 'api/_bundle',
  outExtension: { '.js': '.mjs' },
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node22',
  tsconfig: 'tsconfig.server.json',
  logLevel: 'warning',
  plugins: [embedHolidays],
});
