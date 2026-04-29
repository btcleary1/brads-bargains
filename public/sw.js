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
  // iOS requires an absolute URL for clients.openWindow
  const targetUrl = rawUrl.startsWith('http') ? rawUrl : `${self.location.origin}${rawUrl}`;
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      for (const client of windowClients) {
        if ('navigate' in client) {
          return client.navigate(targetUrl).then(c => c?.focus());
        }
      }
      return clients.openWindow(targetUrl);
    })
  );
});
