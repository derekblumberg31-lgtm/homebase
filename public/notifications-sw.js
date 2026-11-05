// Loaded into the generated service worker (see workbox.importScripts in vite.config.ts).
// Without this, tapping a reminder on a phone does nothing.
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windows) => {
      if (windows[0]) return windows[0].focus();
      return self.clients.openWindow(self.registration.scope);
    }),
  );
});
