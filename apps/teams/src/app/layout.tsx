import type { Metadata } from 'next';
import { Source_Sans_3 } from 'next/font/google';
import type { ReactNode } from 'react';
import { LEGACY_PRODUCT_NAME as PRODUCT_NAME, LEGACY_PRODUCT_TAGLINE as PRODUCT_TAGLINE } from '@/lib/brand';
import './globals.css';

/*
 * Two families at most: this humanist sans for UI and body everywhere, and a serif for
 * marketing headings, loaded by the marketing page only (so the app never preloads it).
 * Variable font, self-hosted by next/font at build time (no request to Google at runtime,
 * so the CSP's font-src 'self' holds), Latin subset only.
 */
const sans = Source_Sans_3({ subsets: ['latin'], display: 'swap', variable: '--font-ui' });

// Metadata keeps the previous name until the rename follow-up (see src/lib/brand.ts).
export const metadata: Metadata = {
  title: PRODUCT_NAME,
  description: PRODUCT_TAGLINE,
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={sans.variable}>
      <body className="min-h-screen font-sans antialiased">{children}</body>
    </html>
  );
}
