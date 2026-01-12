/**
 * Push notification support for claudectl serve
 */

import webpush from "web-push";
import { getVapidKeys, getPushSubscriptions, removePushSubscription } from "./auth";

interface NotificationPayload {
  title: string;
  body: string;
  tag?: string;
  data?: Record<string, unknown>;
}

let initialized = false;

/**
 * Initialize web-push with VAPID keys
 */
function initWebPush(): void {
  if (initialized) return;

  const vapidKeys = getVapidKeys();
  webpush.setVapidDetails(
    "mailto:claudectl@localhost",
    vapidKeys.publicKey,
    vapidKeys.privateKey
  );

  initialized = true;
}

/**
 * Send push notification to all subscribed clients
 */
export async function sendPushNotification(payload: NotificationPayload): Promise<void> {
  initWebPush();

  const subscriptions = getPushSubscriptions();
  if (subscriptions.length === 0) {
    return;
  }

  const notificationPayload = JSON.stringify({
    title: payload.title,
    body: payload.body,
    tag: payload.tag || "claudectl",
    icon: "/icon-192.png",
    badge: "/icon-192.png",
    data: payload.data || {},
    timestamp: Date.now(),
  });

  const sendPromises = subscriptions.map(async (subscription) => {
    try {
      await webpush.sendNotification(
        {
          endpoint: subscription.endpoint,
          keys: subscription.keys,
        },
        notificationPayload
      );
    } catch (error: unknown) {
      const err = error as { statusCode?: number };
      // If subscription is invalid, remove it
      if (err.statusCode === 404 || err.statusCode === 410) {
        console.log(`[Push] Removing invalid subscription: ${subscription.endpoint}`);
        removePushSubscription(subscription.endpoint);
      } else {
        console.error(`[Push] Error sending notification:`, error);
      }
    }
  });

  await Promise.allSettled(sendPromises);
}

/**
 * Get the public VAPID key for client subscription
 */
export function getPublicVapidKey(): string {
  const keys = getVapidKeys();
  return keys.publicKey;
}
