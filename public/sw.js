self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

self.addEventListener('push', (event) => {
  const data = event.data?.json() ?? {};
  const title = data.title || "Brad's Bargains";
  const options = {
    body: data.body || 'New deal alert!',
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    data: { url: data.url || '/deals' },
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const rawUrl = event.notification.data?.url || '/deals';
  const targetUrl = rawUrl.startsWith('http') ? rawUrl : `${self.location.origin}${rawUrl}`;

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      // Find an existing window on this origin
      const existing = windowClients.find(c => c.url.startsWith(self.location.origin));
      if (existing) {
        // navigate() is Chrome-only — iOS only supports focus()
        if ('navigate' in existing) {
          return existing.navigate(targetUrl).then(c => c && c.focus());
        }
        return existing.focus();
      }
      // No existing window — open a new one
      return clients.openWindow(targetUrl);
    })
  );
});
