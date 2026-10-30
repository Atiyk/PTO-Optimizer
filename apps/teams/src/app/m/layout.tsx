import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import { RegisterServiceWorker } from '@/components/mobile/RegisterServiceWorker';

export const metadata: Metadata = {
  title: 'Days Off (staff)',
  manifest: '/m/manifest.webmanifest',
  appleWebApp: { capable: true, title: 'Days Off', statusBarStyle: 'default' },
  icons: { apple: '/m/icon-192.png' },
};

export const viewport: Viewport = { themeColor: '#1e3a8a', width: 'device-width', initialScale: 1 };
export const dynamic = 'force-dynamic';

/** The staff app: 375px first, big tap targets, no tables. */
export default function MobileLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-surface">
      <RegisterServiceWorker />
      {children}
    </div>
  );
}
