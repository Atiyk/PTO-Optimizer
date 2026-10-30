/* Days Off for Teams staff app service worker (scope /m/).
 * Shows cover-offer push notifications and opens the offer screen on tap.
 * It caches nothing: schedules and offers are always fetched fresh. */
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

self.addEventListener('push', (event) => {
  let data = { title: 'Cover offer', body: 'You have a new cover offer.', url: '/m/offers', tag: 'cover' };
  try {
    data = { ...data, ...event.data.json() };
  } catch (_) {}
  event.waitUntil(self.registration.showNotification(data.title, { body: data.body, tag: data.tag, data: { url: data.url }, icon: '/m/icon-192.png' }));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = new URL((event.notification.data && event.notification.data.url) || '/m/offers', self.location.origin);
  if (url.origin !== self.location.origin) return;
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      for (const c of list) if (c.url.startsWith(self.location.origin + '/m')) return c.navigate(url.href).then((w) => w && w.focus());
      return self.clients.openWindow(url.href);
    }),
  );
});
