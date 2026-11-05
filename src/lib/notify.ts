/**
 * Shows a system notification. Phones only allow this through the service worker: on Android
 * Chrome, `new Notification()` throws. The constructor remains for browsers with no active worker,
 * such as a desktop running the dev server. Rejects if neither works.
 */
export async function showNotification(title: string, options: NotificationOptions): Promise<void> {
  const registration = await navigator.serviceWorker?.getRegistration();
  if (registration?.active) {
    await registration.showNotification(title, options);
    return;
  }
  new Notification(title, options);
}
