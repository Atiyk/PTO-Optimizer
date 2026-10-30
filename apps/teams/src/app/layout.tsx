import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { PRODUCT_NAME, PRODUCT_TAGLINE } from '@/lib/brand';
import './globals.css';

export const metadata: Metadata = {
  title: PRODUCT_NAME,
  description: PRODUCT_TAGLINE,
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen font-sans antialiased">{children}</body>
    </html>
  );
}
