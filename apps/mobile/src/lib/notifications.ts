import * as Notifications from "expo-notifications";
import { AndroidImportance } from "expo-notifications";
import { Platform } from "react-native";
import type { AuthorityNotificationItem } from "@trafficsense/shared";

// Set global foreground notification behavior
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

let isConfigured = false;

/**
 * Configure Android notification channels and request OS permissions.
 */
export async function configureNotificationsAsync(): Promise<boolean> {
  if (Platform.OS === "web") return false;

  try {
    if (Platform.OS === "android") {
      await Notifications.setNotificationChannelAsync("authority-alerts", {
        name: "Traffic Authority Alerts",
        description: "Instant dispatch alerts when road hazards and photo evidence are spotted",
        importance: AndroidImportance.MAX,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: "#0f766e",
        sound: "default",
        enableVibrate: true,
        showBadge: true,
      });
    }

    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;

    if (existingStatus !== "granted") {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }

    isConfigured = finalStatus === "granted";
    return isConfigured;
  } catch (err) {
    console.warn("Failed to configure push notifications:", err);
    return false;
  }
}

/**
 * Schedule an immediate OS system notification for a spotted incident.
 */
export async function dispatchLocalAuthorityNotification(
  item: AuthorityNotificationItem
): Promise<string | null> {
  if (Platform.OS === "web") return null;

  try {
    if (!isConfigured) {
      await configureNotificationsAsync();
    }

    const categoryTitle = item.category.replace(/_/g, " ").toUpperCase();
    const title = item.has_photo
      ? `🚨 Verified Hazard: ${categoryTitle}`
      : `⚠️ Road Incident: ${categoryTitle}`;

    const parts: string[] = [];
    if (item.landmark) {
      parts.push(item.landmark);
    }
    if (item.has_photo) {
      parts.push("📸 Photo evidence corroborated");
    }
    if (item.photo_summary) {
      parts.push(item.photo_summary);
    }

    const body = parts.join(" · ") || `New report at ${item.lat.toFixed(4)}, ${item.lng.toFixed(4)}`;

    const notificationId = await Notifications.scheduleNotificationAsync({
      content: {
        title,
        body,
        sound: true,
        priority: Notifications.AndroidNotificationPriority.MAX,
        badge: 1,
        data: {
          incidentId: item.incident_id,
          notificationId: item.id,
          landmark: item.landmark,
          hasPhoto: item.has_photo,
          category: item.category,
        },
      },
      trigger: null, // null trigger schedules immediately
    });

    return notificationId;
  } catch (err) {
    console.warn("Could not dispatch local OS notification:", err);
    return null;
  }
}

/**
 * Handle user tapping the notification banner in system tray.
 */
export function setupNotificationResponseListener(onSelectIncident?: (incidentId: string) => void): () => void {
  if (Platform.OS === "web") return () => {};

  const subscription = Notifications.addNotificationResponseReceivedListener((response) => {
    const data = response.notification.request.content.data;
    if (data?.incidentId && onSelectIncident) {
      onSelectIncident(String(data.incidentId));
    }
  });

  return () => {
    subscription.remove();
  };
}
