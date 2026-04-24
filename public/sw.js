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
  event.waitUntil(clients.openWindow(event.notification.data?.url || '/deals'));
});
