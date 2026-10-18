import { resolve } from 'node:path'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

// Country landing pages (Phase 2B): each is a real static HTML file at the project root
// (uk/index.html, canada/index.html, ...), loading the same app bundle as / but with its
// own crawlable <title>/meta tags and a country preset set before the script runs. Vite
// treats any .html file as a build entry once listed here; the dev server picks them up
// automatically with no extra config.
const COUNTRY_SLUGS = ['uk', 'canada', 'australia', 'germany', 'ireland', 'india']

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      input: {
        main: resolve(import.meta.dirname, 'index.html'),
        ...Object.fromEntries(
          COUNTRY_SLUGS.map((slug) => [slug, resolve(import.meta.dirname, slug, 'index.html')]),
        ),
      },
    },
  },
  test: {
    environment: 'jsdom',
    globals: false,
  },
})
