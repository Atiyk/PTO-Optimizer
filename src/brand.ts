/**
 * The product's name, in one place (redesign Phase 0, decision D1). Everything user-facing
 * that names the product - the header wordmark, the footer, page titles, OG images, JSON-LD,
 * ICS metadata - reads these constants, so a future rename is a one-line change here (plus
 * the static files under public/, which can't import TS and are covered by brand.test.ts).
 *
 * Pure constants with no imports: safe for the browser bundle, the Node build scripts and
 * vite.config.ts alike.
 */
export const PRODUCT_NAME = 'Gapless PTO Optimizer';
/** For tight spaces: the header wordmark under 400px, the PWA icon label. */
export const PRODUCT_SHORT_NAME = 'Gapless PTO';
export const TAGLINE = 'Your year, planned around the time that’s yours.';
