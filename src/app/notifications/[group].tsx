import { useCallback, useState } from "react";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { ArrowLeft, Bell } from "lucide-react-native";
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { useAuth } from "../../components/auth-provider";
import { colors } from "../../components/theme";
import { EmptyState } from "../../components/empty-state";
import { loadNotificationHistory, markNotificationRead, NotificationData, notificationGroups, notificationHref, notificationRequiresAction } from "../../lib/notifications";

export default function NotificationHistoryScreen() {
  const router = useRouter();
  const { group: groupKey } = useLocalSearchParams<{ group: string }>();
  const { ready, userId } = useAuth();
  const [notifications, setNotifications] = useState<NotificationData[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const group = notificationGroups.find((item) => item.key === groupKey);

  const refresh = useCallback(async () => {
    if (!userId || !group) return;
    try {
      setNotifications(await loadNotificationHistory(userId, group.key));
      setError("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not load notification history.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [userId, group]);

  useFocusEffect(useCallback(() => {
    if (!ready) return;
    if (!group) {
      setLoading(false);
      return;
    }
    setLoading(true);
    void refresh();
  }, [ready, refresh, group]));

  async function refreshNow() {
    if (refreshing) return;
    setRefreshing(true);
    await refresh();
  }

  async function openNotification(item: NotificationData) {
    if (!userId) return;
    if (!item.readAt && !notificationRequiresAction(item.type)) {
      try {
        await markNotificationRead(userId, item.id, item.type);
        setNotifications((current) => current.map((row) =>
          row.id === item.id ? { ...row, readAt: new Date().toISOString() } : row));
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "Could not mark the notification as read.");
      }
    }
    router.push(notificationHref({ ...item.data, type: item.type }));
  }

  const unreadCount = notifications.filter((item) => !item.readAt).length;

  return <View style={styles.screen}>
    <View style={styles.header}>
      <Pressable accessibilityRole="button" accessibilityLabel="Back to notifications" onPress={() => router.back()} style={styles.back}><ArrowLeft color={colors.ink} size={19} /></Pressable>
      <View style={styles.heading}>
        <Text style={styles.title}>{group?.title ?? "Notifications"}</Text>
        <Text style={styles.subtitle}>{unreadCount ? `${unreadCount} unread` : `${notifications.length} notification${notifications.length === 1 ? "" : "s"}`}</Text>
      </View>
    </View>
    {!!error && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
    {loading ? <ActivityIndicator color={colors.leaf} style={styles.loader} /> : !group ? <EmptyState icon={Bell} title="Category unavailable" description="This notification category doesn’t exist." /> : notifications.length === 0
      ? <EmptyState icon={Bell} title="No notifications yet" description={`There’s no ${group.title.toLowerCase()} history to show.`} />
      : <ScrollView contentContainerStyle={styles.list} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void refreshNow()} />}>
        {notifications.map((item) => <Pressable accessibilityRole="button" key={item.id} onPress={() => void openNotification(item)} style={[styles.item, !item.readAt && styles.unreadItem]}>
          <View style={[styles.unreadMark, !item.readAt && styles.unreadMarkActive]} />
          <View style={styles.itemCopy}>
            <Text style={styles.itemTitle}>{item.title}</Text>
            <Text style={styles.itemBody}>{item.body}</Text>
            <Text style={styles.itemTime}>{new Date(item.createdAt).toLocaleString(undefined, { year: "numeric", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</Text>
          </View>
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
  error: { marginHorizontal: 18, marginTop: 10, color: "#9B493C", fontSize: 9 },
  loader: { marginTop: 30 },
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
