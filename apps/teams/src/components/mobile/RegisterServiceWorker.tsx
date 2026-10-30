'use client';

import { useEffect } from 'react';

export function RegisterServiceWorker() {
  useEffect(() => {
    if ('serviceWorker' in navigator) navigator.serviceWorker.register('/m/sw.js', { scope: '/m/' }).catch(() => {});
  }, []);
  return null;
}
