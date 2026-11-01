import { PRODUCT_NAME } from '@/lib/brand';

/** Web app manifest for the staff app (installable from the browser on phones). */
export function GET() {
  return Response.json(
    {
      name: `${PRODUCT_NAME} (staff)`,
      short_name: PRODUCT_NAME,
      start_url: '/m',
      scope: '/m/',
      display: 'standalone',
      background_color: '#faf8f5',
      theme_color: '#0f5c4d',
      icons: [
        { src: '/m/icon-192.png', sizes: '192x192', type: 'image/png' },
        { src: '/m/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' },
      ],
    },
    { headers: { 'content-type': 'application/manifest+json' } },
  );
}
