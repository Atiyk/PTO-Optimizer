import { resolve } from 'node:path'
import react from '@vitejs/plugin-react'
import { configDefaults, defineConfig, type Plugin } from 'vitest/config'
import { getSiteUrl } from './scripts/siteUrl.ts'

// Country landing pages (Phase 2B): each is a real static HTML file at the project root
// (uk/index.html, canada/index.html, ...), loading the same app bundle as / but with its
// own crawlable <title>/meta tags and a country preset set before the script runs. Vite
// treats any .html file as a build entry once listed here; the dev server picks them up
// automatically with no extra config.
const COUNTRY_SLUGS = ['uk', 'canada', 'australia', 'germany', 'ireland', 'india']

/**
 * Phase 1: every HTML entry's canonical/og:url/og:image/twitter:image/Plausible
 * data-domain used to hardcode pto-optimizer.app directly. Replaced with %SITE_URL%/
 * %SITE_HOST% placeholders in each HTML file, interpolated here from the one shared
 * getSiteUrl() - a plain transformIndexHtml plugin rather than Vite's own %VITE_X% env
 * interpolation, so the value is computed by the SAME function scripts/prerender.ts and
 * scripts/build-seo-files.ts call (no risk of the html build and the Node postbuild
 * scripts reading two different env-loading mechanisms and silently disagreeing).
 */
function siteUrlHtmlPlugin(): Plugin {
  const siteUrl = getSiteUrl()
  const siteHost = new URL(siteUrl).host
  return {
    name: 'site-url-html-interpolation',
    transformIndexHtml(html) {
      return html.replaceAll('%SITE_URL%', siteUrl).replaceAll('%SITE_HOST%', siteHost)
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), siteUrlHtmlPlugin()],
  build: {
    rollupOptions: {
      input: {
        // "/" is now the landing page (site restructure); the optimizer itself lives at
        // /pto, loading the same App.tsx it always has, just from a new path - every
        // country route below is untouched, since none of those links need to move.
        main: resolve(import.meta.dirname, 'index.html'),
        pto: resolve(import.meta.dirname, 'pto', 'index.html'),
        sabbatical: resolve(import.meta.dirname, 'sabbatical', 'index.html'),
        faq: resolve(import.meta.dirname, 'faq', 'index.html'),
        dataSources: resolve(import.meta.dirname, 'data-sources', 'index.html'),
        ...Object.fromEntries(
          COUNTRY_SLUGS.map((slug) => [slug, resolve(import.meta.dirname, slug, 'index.html')]),
        ),
      },
    },
  },
  test: {
    environment: 'jsdom',
    globals: false,
    // apps/* run their own test suites (npm run test:all); the root run is Days Off + engine.
    exclude: [...configDefaults.exclude, 'apps/**'],
  },
})
