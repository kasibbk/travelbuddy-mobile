import * as Notifications from "expo-notifications";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Platform } from "react-native";
import { localFirst } from "./local-first";
import { updateStored } from "./local-store";
import { supabase } from "./supabase";

export type NotificationData = {
  id: string;
  type: string;
  title: string;
  body: string;
  data: Record<string, string>;
  createdAt: string;
  readAt: string | null;
};

export type NotificationGroup = { key: string; title: string; types: readonly string[] };

export const notificationGroups: NotificationGroup[] = [
  { key: "friend-requests", title: "Friend requests", types: ["friend_request"] },
  { key: "friend-updates", title: "Friend updates", types: ["friend_accepted", "friend_declined"] },
  { key: "ride-requests", title: "Ride requests", types: ["ride_request"] },
  { key: "ride-request-updates", title: "Ride request updates", types: ["ride_request_update", "ride_request_cancelled"] },
  { key: "ride-updates", title: "Ride updates", types: ["ride_update"] },
  { key: "ride-admin", title: "Ride admin", types: ["ride_admin"] },
];

const notificationsKey = "notifications";
let foregroundConversationId: string | null = null;

export function setForegroundConversation(conversationId: string | null): void {
  foregroundConversationId = conversationId;
}

export function notificationRequiresAction(type: string): boolean {
  return type === "friend_request" || type === "ride_request";
}

export function notificationGroupForType(type: string): NotificationGroup {
  return notificationGroups.find((group) => group.types.includes(type)) ?? {
    key: "other",
    title: "Other updates",
    types: [],
  };
}

export async function loadNotificationHistory(userId: string, groupKey: string): Promise<NotificationData[]> {
  const group = notificationGroups.find((item) => item.key === groupKey);
  if (!group) throw new Error("This notification category is unavailable.");

  const pageSize = 500;
  const history: NotificationData[] = [];
  for (let start = 0; ; start += pageSize) {
    const { data, error } = await supabase.from("notifications")
      .select("id, type, title, body, data, created_at, read_at")
      .eq("user_id", userId)
      .in("type", [...group.types])
      .order("created_at", { ascending: false })
      .range(start, start + pageSize - 1);
    if (error) throw error;
    const page = (data ?? []).map((row) => mapNotification(row));
    history.push(...page);
    if (page.length < pageSize) return history;
  }
}

export async function loadUnreadNotificationCounts(): Promise<Record<string, number>> {
  const { data, error } = await supabase.rpc("unread_notification_counts");
  if (error) throw error;
  return Object.fromEntries(((data ?? []) as { notification_type: string; unread_count: number | string }[])
    .map((row) => [row.notification_type, Number(row.unread_count)]));
}

if (Platform.OS !== "web") {
  Notifications.setNotificationHandler({
    handleNotification: async (notification) => {
      const data = notification.request.content.data ?? {};
      const isActiveChatMessage = data.type === "message"
        && typeof data.conversationId === "string"
        && data.conversationId === foregroundConversationId;
      return {
        shouldPlaySound: !isActiveChatMessage,
        shouldSetBadge: false,
        shouldShowBanner: !isActiveChatMessage,
        shouldShowList: !isActiveChatMessage,
      };
    },
  });
}

function readString(record: Record<string, unknown>, key: string): string | null {
  const value = record[key];
  return typeof value === "string" ? value : null;
}

function mapNotification(row: {
  id: string;
  type: string;
  title: string;
  body: string;
  data: unknown;
  created_at: string;
  read_at: string | null;
}): NotificationData {
  const rawData = typeof row.data === "object" && row.data !== null && !Array.isArray(row.data)
    ? row.data as Record<string, unknown>
    : {};
  const data: Record<string, string> = {};
  for (const key of ["conversationId", "rideId", "friendRequestId"]) {
    const value = readString(rawData, key);
    if (value) data[key] = value;
  }
  return { id: row.id, type: row.type, title: row.title, body: row.body, data, createdAt: row.created_at, readAt: row.read_at };
}

export async function loadNotifications(userId: string, force = false): Promise<NotificationData[]> {
  const cached = await localFirst(userId, notificationsKey, async () => {
    const { data, error } = await supabase.from("notifications")
      .select("id, type, title, body, data, created_at, read_at")
      .eq("user_id", userId)
      .neq("type", "message")
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) throw error;
    return (data ?? []).map((row) => mapNotification(row));
  }, { force });
  const visible = cached.filter((item) => item.type !== "message");
  if (visible.length !== cached.length) {
    await updateStored<NotificationData[]>(userId, notificationsKey, () => visible);
  }
  return visible;
}

export async function markNotificationRead(userId: string, notificationId: string, type: string): Promise<void> {
  if (notificationRequiresAction(type)) return;
  const readAt = new Date().toISOString();
  const { error } = await supabase.from("notifications")
    .update({ read_at: readAt })
    .eq("id", notificationId)
    .eq("user_id", userId)
    .is("read_at", null);
  if (error) throw error;
  await updateStored<NotificationData[]>(userId, notificationsKey, (rows) => rows
    .filter((row) => row.type !== "message")
    .map((row) => row.id === notificationId ? { ...row, readAt } : row));
}

export async function markAllNotificationsRead(userId: string): Promise<void> {
  const readAt = new Date().toISOString();
  const { error } = await supabase.from("notifications")
    .update({ read_at: readAt })
    .eq("user_id", userId)
    .neq("type", "message")
    .not("type", "in", "(friend_request,ride_request)")
    .is("read_at", null);
  if (error) throw error;
  await updateStored<NotificationData[]>(userId, notificationsKey, (rows) =>
    rows.filter((row) => row.type !== "message").map((row) =>
      row.readAt || notificationRequiresAction(row.type) ? row : { ...row, readAt }));
}

export async function getPushPermissionStatus(): Promise<Notifications.PermissionStatus | "unsupported"> {
  if (Platform.OS === "web") return "unsupported";
  const { status } = await Notifications.getPermissionsAsync();
  return status;
}

export async function registerPushNotifications(userId: string): Promise<void> {
  if (Platform.OS !== "ios" && Platform.OS !== "android") {
    throw new Error("Push notifications are only available in the TravelBuddy mobile app.");
  }

  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync("default", {
      name: "TravelBuddy updates",
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: "#6D8A43",
    });
  }

  const existing = await Notifications.getPermissionsAsync();
  const permission = existing.status === "granted" ? existing : await Notifications.requestPermissionsAsync();
  if (permission.status !== "granted") {
    throw new Error("Notification permission was not granted. You can enable it in your device settings.");
  }

  const token = await Notifications.getDevicePushTokenAsync();
  if (token.type !== "ios" && token.type !== "android") {
    throw new Error("TravelBuddy did not receive a native iOS or Android push token.");
  }

  const storageKey = `@travelbuddy/push-token/${userId}`;
  const previousToken = await AsyncStorage.getItem(storageKey);
  await AsyncStorage.setItem(storageKey, token.data);
  const { error } = await supabase.rpc("register_push_token", {
    p_token: token.data,
    p_platform: token.type,
  });
  if (error) {
    if (previousToken) await AsyncStorage.setItem(storageKey, previousToken);
    else await AsyncStorage.removeItem(storageKey);
    throw error;
  }
}

export async function unregisterPushTokens(userId: string): Promise<void> {
  const storageKey = `@travelbuddy/push-token/${userId}`;
  const token = await AsyncStorage.getItem(storageKey);
  if (!token) return;
  const { error } = await supabase.rpc("unregister_push_token", { p_token: token });
  if (error) throw error;
  await AsyncStorage.removeItem(storageKey);
}

export function notificationHref(data: unknown) {
  const row = typeof data === "object" && data !== null ? data as Record<string, unknown> : {};
  const conversationId = readString(row, "conversationId");
  const rideId = readString(row, "rideId");
  const type = readString(row, "type");
  if (conversationId) return { pathname: "/chat/[id]" as const, params: { id: conversationId } };
  if (rideId) return { pathname: "/rides/[id]" as const, params: { id: rideId } };
  if (type?.startsWith("friend_")) return "/(tabs)/friends" as const;
  return "/notifications" as const;
}
