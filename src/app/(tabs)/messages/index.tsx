import { useCallback, useMemo, useState } from "react";
import { MessageCircle, Users } from "lucide-react-native";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { AppHeader } from "../../../components/app-header";
import { EmptyState } from "../../../components/empty-state";
import { PageShell } from "../../../components/page-shell";
import { colors } from "../../../components/theme";
import { useAuth } from "../../../components/auth-provider";
import { useStoreVersion } from "../../../lib/store-events";
import { ConversationData, loadConversations } from "../../../lib/app-data";

export default function MessagesScreen() {
  const router = useRouter();
  const { ready, userId } = useAuth();
  const [tab, setTab] = useState("All");
  const [conversations, setConversations] = useState<ConversationData[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [refreshError, setRefreshError] = useState("");
  const storeVersion = useStoreVersion();

  useFocusEffect(useCallback(() => {
    if (!ready) return;
    if (!userId) { setConversations([]); setLoading(false); return; }
    let active = true;
    setError("");
    loadConversations(userId)
      .then((rows) => { if (active) setConversations(rows); })
      .catch((cause: unknown) => { if (active) setError(cause instanceof Error ? cause.message : "Could not load conversations."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [ready, userId, storeVersion]));

  async function refreshConversations() {
    if (!userId || refreshing) return;
    setRefreshing(true);
    setRefreshError("");
    try {
      setConversations(await loadConversations(userId, true));
      setError("");
    } catch (cause) {
      setRefreshError(cause instanceof Error ? cause.message : "Could not refresh conversations.");
    } finally {
      setRefreshing(false);
    }
  }

  const visible = useMemo(() => conversations.filter((conversation) => tab === "All" || conversation.kind === "ride"), [conversations, tab]);

  return <PageShell refreshing={refreshing} onRefresh={refreshConversations}><AppHeader eyebrow="MAKE THE PLAN, KEEP THE FRIEND" title="Messages" subtitle="Ride details, coffee stops, and the occasional “where are you?”" />
    <View style={styles.tabs}>{["All", "Ride chats"].map((item) => <Pressable key={item} onPress={() => setTab(item)} style={[styles.tab, tab === item && styles.tabActive]}><Text style={[styles.tabText, tab === item && styles.tabTextActive]}>{item}</Text></Pressable>)}</View>
    <View style={styles.inboxNote}><MessageCircle color={colors.leaf} size={15} /><Text style={styles.inboxNoteText}>Ride conversations are visible to approved riders and their admins.</Text></View>
    {!!refreshError && <Text accessibilityRole="alert" style={styles.refreshError}>{refreshError}</Text>}
    {loading ? <ActivityIndicator color={colors.leaf} style={styles.loader} /> : error ? <EmptyState icon={MessageCircle} title="Messages couldn’t load" description={error} /> : visible.length ? <View style={styles.conversationList}>{visible.map((conversation) => { const initials = conversation.title.split(/\s+/).map((part) => part[0]).join("").slice(0, 2).toUpperCase(); return <Pressable style={styles.conversation} key={conversation.id} onPress={() => router.push({ pathname: "/chat/[id]", params: { id: conversation.id } })}><View style={styles.avatarWrap}><View style={styles.avatar}><Text style={styles.avatarText}>{initials}</Text></View>{conversation.kind === "ride" && <View style={styles.groupMark}><Users color={colors.surface} size={9} /></View>}</View><View style={styles.conversationContent}><View style={styles.conversationTop}><Text numberOfLines={1} style={styles.conversationName}>{conversation.title}</Text><Text style={styles.time}>{conversation.updatedAt ? new Date(conversation.updatedAt).toLocaleDateString() : ""}</Text></View><Text numberOfLines={1} style={styles.preview}>{conversation.lastMessage ?? "No messages yet"}</Text><Text style={styles.memberNote}>{conversation.detail}</Text></View>{conversation.unreadCount > 0 && <View style={styles.unreadBadge}><Text style={styles.unreadBadgeText}>{conversation.unreadCount > 99 ? "99+" : conversation.unreadCount}</Text></View>}</Pressable>; })}</View> : <EmptyState icon={tab === "All" ? MessageCircle : Users} title={tab === "All" ? "No conversations yet" : "No ride chats yet"} description={tab === "All" ? "Ride chats and direct conversations available to your account will appear here." : "Ride chats appear once you’re approved for a ride or assigned as its admin."} />}
  </PageShell>;
}

const styles = StyleSheet.create({
  tabs: { marginHorizontal: 20, marginBottom: 13, borderBottomWidth: 1, borderBottomColor: colors.line, flexDirection: "row", gap: 20 }, tab: { paddingBottom: 9 }, tabActive: { borderBottomWidth: 2, borderBottomColor: colors.forest }, tabText: { color: colors.muted, fontSize: 10, fontWeight: "600" }, tabTextActive: { color: colors.forest, fontWeight: "800" },
  inboxNote: { marginHorizontal: 16, marginBottom: 13, paddingHorizontal: 11, paddingVertical: 10, borderRadius: 8, backgroundColor: "#E9EFE1", flexDirection: "row", alignItems: "center", gap: 7 }, inboxNoteText: { flex: 1, color: "#65796A", fontSize: 8 },
  refreshError: { marginHorizontal: 20, marginBottom: 8, color: "#9B493C", fontSize: 8, lineHeight: 12 },
  loader: { marginVertical: 24 },
  conversationList: { marginHorizontal: 16, paddingHorizontal: 12, borderWidth: 1, borderColor: colors.line, borderRadius: 11, backgroundColor: colors.surface }, conversation: { minHeight: 75, borderBottomWidth: 1, borderBottomColor: "#EEF0E9", flexDirection: "row", alignItems: "center", gap: 10 }, avatarWrap: { position: "relative" }, avatar: { width: 42, height: 42, borderRadius: 21, alignItems: "center", justifyContent: "center", backgroundColor: colors.leaf }, avatarText: { color: colors.surface, fontSize: 10, fontWeight: "800" }, groupMark: { position: "absolute", right: -3, bottom: -2, width: 18, height: 18, borderRadius: 9, alignItems: "center", justifyContent: "center", borderWidth: 2, borderColor: colors.surface, backgroundColor: colors.forest }, unreadBadge: { minWidth: 20, height: 20, paddingHorizontal: 5, borderRadius: 10, alignItems: "center", justifyContent: "center", backgroundColor: colors.orange }, unreadBadgeText: { color: colors.surface, fontSize: 8, fontWeight: "800" },
  conversationContent: { flex: 1, gap: 4 }, conversationTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 7 }, conversationName: { flex: 1, color: colors.ink, fontSize: 10, fontWeight: "700" }, time: { color: colors.subtle, fontSize: 7, fontWeight: "700" }, preview: { color: colors.muted, fontSize: 8 }, memberNote: { color: colors.leaf, fontSize: 7 },
});