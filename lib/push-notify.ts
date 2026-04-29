import * as webpush from 'web-push';

function initVapid() {
  webpush.setVapidDetails(
    `mailto:${process.env.VAPID_EMAIL?.trim()}`,
    process.env.VAPID_PUBLIC_KEY!.trim(),
    process.env.VAPID_PRIVATE_KEY!.trim(),
  );
}

export async function sendPushToSubscriptions(
  subscriptions: object[],
  title: string,
  body: string,
  url = '/deals?view=digest',
): Promise<{ sent: number; failed: number }> {
  if (!subscriptions.length) return { sent: 0, failed: 0 };
  initVapid();
  const payload = JSON.stringify({ title, body, url });
  const results = await Promise.allSettled(
    subscriptions.map(sub => webpush.sendNotification(sub as webpush.PushSubscription, payload))
  );
  return {
    sent: results.filter(r => r.status === 'fulfilled').length,
    failed: results.filter(r => r.status === 'rejected').length,
  };
}
