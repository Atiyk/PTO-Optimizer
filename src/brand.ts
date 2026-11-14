/**
 * The product's name, in one place (redesign Phase 0, decision D1). Everything user-facing
 * that names the product - the header wordmark, the footer, page titles, OG images, JSON-LD,
 * ICS metadata - reads these constants, so a future rename is a one-line change here (plus
 * the static files under public/, which can't import TS and are covered by brand.test.ts).
 *
 * Pure constants with no imports: safe for the browser bundle, the Node build scripts and
 * vite.config.ts alike.
 */
export const PRODUCT_NAME = 'Timebower';
/** For tight spaces: the header wordmark and structured metadata. */
export const PRODUCT_SHORT_NAME = 'Timebower';
/** A plain, checkable statement of what the product does (F15). Shown in the footer. */
export const TAGLINE = 'Plans your PTO around weekends and your country’s public holidays.';
