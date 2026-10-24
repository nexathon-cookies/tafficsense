import type { AuthorityNotificationItem } from "@trafficsense/shared";

/**
 * Configure OS push notifications.
 * Disabled locally for Expo Go compatibility where native push modules
 * (e.g. ExpoTopicSubscriptionModule) are not bundled.
 */
export async function configureNotificationsAsync(): Promise<boolean> {
  return false;
}

/**
 * Schedule an OS system notification for a spotted incident.
 * In-app live banners in the UI handle real-time alerts without native push module crashes.
 */
export async function dispatchLocalAuthorityNotification(
  _item: AuthorityNotificationItem
): Promise<string | null> {
  return null;
}

/**
 * Handle user tapping the notification banner in system tray.
 */
export function setupNotificationResponseListener(
  _onSelectIncident?: (incidentId: string) => void
): () => void {
  return () => {};
}
