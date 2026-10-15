import { useCallback, useState } from "react";
import { useFocusEffect, useRouter } from "expo-router";
import { ArrowLeft, Bell, CheckCheck } from "lucide-react-native";
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { useAuth } from "../components/auth-provider";
import { colors } from "../components/theme";
import { getPushPermissionStatus, loadNotifications, markAllNotificationsRead, markNotificationRead, NotificationData, notificationHref, registerPushNotifications } from "../lib/notifications";
import { useStoreVersion } from "../lib/store-events";

export default function NotificationsScreen() {
  const router = useRouter();
  const { ready, userId } = useAuth();
  const [notifications, setNotifications] = useState<NotificationData[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [pushMessage, setPushMessage] = useState("");
  const [pushEnabled, setPushEnabled] = useState(false);
  const [busy, setBusy] = useState(false);
  const storeVersion = useStoreVersion();

  const refresh = useCallback(async (force = false) => {
    if (!userId) return;
    try {
      setNotifications(await loadNotifications(userId, force));
      setError("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not load notifications.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [userId]);

  useFocusEffect(useCallback(() => {
    if (!ready) return;
    if (!userId) { setNotifications([]); setLoading(false); return; }
    let active = true;
    setLoading(true);
    void refresh().then(async () => {
      if (!active) return;
      try {
        const status = await getPushPermissionStatus();
        if (status === "granted") {
          await registerPushNotifications(userId);
          if (active) setPushEnabled(true);
        }
      } catch (cause) {
        if (active) setPushMessage(cause instanceof Error ? cause.message : "Push registration failed.");
      }
    });
    return () => { active = false; };
  }, [ready, userId, storeVersion, refresh]));

  async function refreshNow() {
    if (refreshing) return;
    setRefreshing(true);
    await refresh(true);
  }

  async function enablePush() {
    if (!userId || busy) return;
    setBusy(true);
    setPushMessage("");
    try {
      await registerPushNotifications(userId);
      setPushEnabled(true);
      setPushMessage("Push notifications are enabled on this device.");
    } catch (cause) {
      setPushMessage(cause instanceof Error ? cause.message : "Could not enable push notifications.");
    } finally {
      setBusy(false);
    }
  }

  async function markAllRead() {
    if (!userId || busy) return;
    setBusy(true);
    setError("");
    try {
      await markAllNotificationsRead(userId);
      setNotifications((rows) => rows.map((row) => row.readAt ? row : { ...row, readAt: new Date().toISOString() }));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not mark notifications as read.");
    } finally {
      setBusy(false);
    }
  }

  async function openNotification(item: NotificationData) {
    if (!userId) return;
    if (!item.readAt) {
      try {
        await markNotificationRead(userId, item.id);
        setNotifications((rows) => rows.map((row) => row.id === item.id ? { ...row, readAt: new Date().toISOString() } : row));
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "Could not mark the notification as read.");
      }
    }
    router.push(notificationHref({ ...item.data, type: item.type }));
  }

  const unreadCount = notifications.filter((item) => !item.readAt).length;

  return <View style={styles.screen}>
    <View style={styles.header}>
      <Pressable accessibilityRole="button" accessibilityLabel="Back" onPress={() => router.back()} style={styles.back}><ArrowLeft color={colors.ink} size={19} /></Pressable>
      <View style={styles.heading}><Text style={styles.title}>Notifications</Text><Text style={styles.subtitle}>{unreadCount ? `${unreadCount} unread update${unreadCount === 1 ? "" : "s"}` : "You’re all caught up"}</Text></View>
      {unreadCount > 0 && <Pressable accessibilityRole="button" accessibilityLabel="Mark all notifications read" onPress={() => void markAllRead()} style={styles.readAll}><CheckCheck color={colors.forest} size={18} /></Pressable>}
    </View>
    <View style={styles.pushCard}>
      <View style={styles.pushIcon}><Bell color={colors.forest} size={17} /></View>
      <View style={styles.pushCopy}><Text style={styles.pushTitle}>{pushEnabled ? "Push notifications enabled" : "Get updates while you’re away"}</Text><Text style={styles.pushBody}>Messages, friend activity, and ride updates.</Text></View>
      {!pushEnabled && <Pressable accessibilityRole="button" disabled={busy} onPress={() => void enablePush()} style={styles.enableButton}>{busy ? <ActivityIndicator size="small" color={colors.surface} /> : <Text style={styles.enableText}>Enable</Text>}</Pressable>}
    </View>
    {!!pushMessage && <Text accessibilityRole="alert" style={styles.pushMessage}>{pushMessage}</Text>}
    {!!error && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
    {loading ? <ActivityIndicator color={colors.leaf} style={styles.loader} /> : notifications.length === 0
      ? <View style={styles.empty}><Bell color={colors.subtle} size={24} /><Text style={styles.emptyTitle}>No notifications yet</Text><Text style={styles.emptyBody}>Activity on your rides and conversations will show up here.</Text></View>
      : <ScrollView contentContainerStyle={styles.list} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void refreshNow()} />}>
        {notifications.map((item) => <Pressable accessibilityRole="button" key={item.id} onPress={() => void openNotification(item)} style={[styles.item, !item.readAt && styles.unreadItem]}>
          <View style={[styles.unreadMark, !item.readAt && styles.unreadMarkActive]} />
          <View style={styles.itemCopy}><Text style={styles.itemTitle}>{item.title}</Text><Text style={styles.itemBody}>{item.body}</Text><Text style={styles.itemTime}>{new Date(item.createdAt).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</Text></View>
        </Pressable>)}
      </ScrollView>}
  </View>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.paper },
  header: { minHeight: 70, paddingHorizontal: 18, borderBottomWidth: 1, borderBottomColor: colors.line, backgroundColor: colors.surface, flexDirection: "row", alignItems: "center", gap: 10 },
  back: { width: 32, height: 38, alignItems: "flex-start", justifyContent: "center" },
  heading: { flex: 1, gap: 3 },
  title: { color: colors.ink, fontSize: 16, fontWeight: "800" },
  subtitle: { color: colors.muted, fontSize: 9 },
  readAll: { width: 34, height: 34, alignItems: "center", justifyContent: "center" },
  pushCard: { margin: 15, padding: 12, borderWidth: 1, borderColor: colors.line, borderRadius: 11, backgroundColor: colors.surface, flexDirection: "row", alignItems: "center", gap: 10 },
  pushIcon: { width: 34, height: 34, borderRadius: 10, alignItems: "center", justifyContent: "center", backgroundColor: "#E9EFE1" },
  pushCopy: { flex: 1, gap: 3 },
  pushTitle: { color: colors.ink, fontSize: 10, fontWeight: "800" },
  pushBody: { color: colors.muted, fontSize: 8 },
  enableButton: { minWidth: 54, minHeight: 32, paddingHorizontal: 10, borderRadius: 8, alignItems: "center", justifyContent: "center", backgroundColor: colors.forest },
  enableText: { color: colors.surface, fontSize: 9, fontWeight: "800" },
  pushMessage: { marginHorizontal: 18, marginBottom: 8, color: colors.muted, fontSize: 9 },
  error: { marginHorizontal: 18, marginBottom: 8, color: "#9B493C", fontSize: 9 },
  loader: { marginTop: 30 },
  empty: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 36, gap: 9 },
  emptyTitle: { color: colors.ink, fontSize: 12, fontWeight: "800" },
  emptyBody: { color: colors.muted, fontSize: 9, lineHeight: 14, textAlign: "center" },
  list: { padding: 15, gap: 8 },
  item: { minHeight: 77, padding: 12, borderWidth: 1, borderColor: colors.line, borderRadius: 10, backgroundColor: colors.surface, flexDirection: "row", alignItems: "flex-start", gap: 9 },
  unreadItem: { borderColor: "#DCE6D1", backgroundColor: "#F9FBF6" },
  unreadMark: { width: 7, height: 7, marginTop: 4, borderRadius: 4, backgroundColor: "transparent" },
  unreadMarkActive: { backgroundColor: colors.orange },
  itemCopy: { flex: 1, gap: 4 },
  itemTitle: { color: colors.ink, fontSize: 10, fontWeight: "800" },
  itemBody: { color: colors.muted, fontSize: 9, lineHeight: 14 },
  itemTime: { marginTop: 3, color: colors.subtle, fontSize: 8 },
});
