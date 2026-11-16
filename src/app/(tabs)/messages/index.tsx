import { useCallback, useMemo, useState } from "react";
import { MessageCircle, Search, Users, X } from "lucide-react-native";
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { Avatar } from "../../../components/avatar";
import { EmptyState } from "../../../components/empty-state";
import { PageShell } from "../../../components/page-shell";
import { colors } from "../../../components/theme";
import { useAuth } from "../../../components/auth-provider";
import { useStoreVersion } from "../../../lib/store-events";
import { ConversationData, getImagePublicUrl, loadConversations } from "../../../lib/app-data";

export default function MessagesScreen() {
  const router = useRouter();
  const { ready, userId } = useAuth();
  const [tab, setTab] = useState("All");
  const [search, setSearch] = useState("");
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

  const visible = useMemo(() => conversations.filter((conversation) => {
    const matchesTab = tab === "All" || conversation.kind === "ride";
    const query = search.trim().toLocaleLowerCase();
    return matchesTab && (!query || `${conversation.title} ${conversation.lastMessage} ${conversation.detail}`.toLocaleLowerCase().includes(query));
  }), [conversations, search, tab]);

  return <PageShell refreshing={refreshing} onRefresh={refreshConversations} showFloatingActions showAppTopBar>
    <View style={styles.searchBar}><Search color={colors.muted} size={17} /><TextInput value={search} onChangeText={setSearch} placeholder="Search chats" placeholderTextColor={colors.subtle} returnKeyType="search" style={styles.searchInput} />{!!search && <Pressable accessibilityRole="button" accessibilityLabel="Clear chat search" onPress={() => setSearch("")}><X color={colors.muted} size={17} /></Pressable>}</View>
    <View style={styles.tabs}>{["All", "Ride chats"].map((item) => <Pressable key={item} onPress={() => setTab(item)} style={[styles.tab, tab === item && styles.tabActive]}><Text style={[styles.tabText, tab === item && styles.tabTextActive]}>{item}</Text></Pressable>)}</View>
    {!!refreshError && <Text accessibilityRole="alert" style={styles.refreshError}>{refreshError}</Text>}
    {loading ? <ActivityIndicator color={colors.leaf} style={styles.loader} /> : error ? <EmptyState icon={MessageCircle} title="Messages couldn’t load" description={error} /> : visible.length ? <View style={styles.conversationList}>{visible.map((conversation) => { const initials = conversation.title.split(/\s+/).map((part) => part[0]).join("").slice(0, 2).toUpperCase(); const updatedAt = conversation.updatedAt ? new Date(conversation.updatedAt) : null; const showSenderTitle = conversation.kind !== "direct" || conversation.lastMessageSender === "You"; return <Pressable style={styles.conversation} key={conversation.id} onPress={() => router.push({ pathname: "/chat/[id]", params: { id: conversation.id } })}><View style={styles.avatarWrap}><Avatar initials={initials} imageUrl={conversation.kind === "direct" ? getImagePublicUrl("profile-images", conversation.avatarPath) : null} color={colors.leaf} size={42} />{conversation.kind !== "direct" && <View style={styles.groupMark}><Users color={colors.surface} size={9} /></View>}</View><View style={styles.conversationContent}><View style={styles.conversationTop}><Text numberOfLines={1} ellipsizeMode="tail" style={styles.conversationName}>{conversation.title}</Text>{showSenderTitle && conversation.lastMessageSender && <Text numberOfLines={1} ellipsizeMode="tail" style={styles.senderTitle}>{conversation.lastMessageSender}</Text>}<Text numberOfLines={1} ellipsizeMode="tail" style={styles.preview}>{conversation.lastMessage ?? "No messages yet"}</Text></View></View><View style={styles.conversationActions}><View style={styles.messageTimestamp}>{updatedAt && <><Text style={styles.time}>{updatedAt.toLocaleDateString()}</Text><Text style={styles.time}>{updatedAt.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}</Text></>}</View>{conversation.lastMessageStatus && <Text style={styles.deliveryStatus}>{conversation.lastMessageStatus[0].toUpperCase() + conversation.lastMessageStatus.slice(1)}</Text>}{conversation.unreadCount > 0 && <View style={styles.unreadBadge}><Text style={styles.unreadBadgeText}>{conversation.unreadCount > 99 ? "99+" : conversation.unreadCount}</Text></View>}</View></Pressable>; })}</View> : <EmptyState icon={tab === "All" ? MessageCircle : Users} title={search ? "No matching chats" : tab === "All" ? "No conversations yet" : "No ride chats yet"} description={search ? "Try another name or message." : tab === "All" ? "Ride chats and direct conversations available to your account will appear here." : "Ride chats appear once you’re approved for a ride or assigned as its admin."} />}
  </PageShell>;
}

const styles = StyleSheet.create({
  searchBar: { minHeight: 44, marginHorizontal: 16, marginTop: 10, marginBottom: 13, paddingHorizontal: 12, borderWidth: 1, borderColor: colors.line, borderRadius: 12, backgroundColor: colors.surface, flexDirection: "row", alignItems: "center", gap: 9 },
  searchInput: { flex: 1, minWidth: 0, paddingVertical: 8, color: colors.ink, fontSize: 11 },
  tabs: { marginHorizontal: 20, marginBottom: 13, borderBottomWidth: 1, borderBottomColor: colors.line, flexDirection: "row", gap: 20 }, tab: { paddingBottom: 9 }, tabActive: { borderBottomWidth: 2, borderBottomColor: colors.forest }, tabText: { color: colors.muted, fontSize: 10, fontWeight: "600" }, tabTextActive: { color: colors.forest, fontWeight: "800" },
  refreshError: { marginHorizontal: 20, marginBottom: 8, color: "#9B493C", fontSize: 8, lineHeight: 12 },
  loader: { marginVertical: 24 },
  conversationList: { marginHorizontal: 16, paddingHorizontal: 12, borderWidth: 1, borderColor: colors.line, borderRadius: 11, backgroundColor: colors.surface }, conversation: { minHeight: 75, borderBottomWidth: 1, borderBottomColor: "#EEF0E9", flexDirection: "row", alignItems: "center", gap: 10 }, avatarWrap: { position: "relative" }, groupMark: { position: "absolute", right: -3, bottom: -2, width: 18, height: 18, borderRadius: 9, alignItems: "center", justifyContent: "center", borderWidth: 2, borderColor: colors.surface, backgroundColor: colors.forest }, unreadBadge: { minWidth: 20, height: 20, paddingHorizontal: 5, borderRadius: 10, alignItems: "center", justifyContent: "center", backgroundColor: colors.orange }, unreadBadgeText: { color: colors.surface, fontSize: 8, fontWeight: "800" },
  conversationContent: { flex: 1, minWidth: 0, gap: 4 }, conversationTop: { gap: 4 }, conversationName: { color: colors.ink, fontSize: 10, fontWeight: "700" }, messageTimestamp: { alignItems: "flex-end", gap: 2 }, time: { color: colors.subtle, fontSize: 7, fontWeight: "700" }, senderTitle: { color: colors.forest, fontSize: 8, fontWeight: "800" }, preview: { color: colors.muted, fontSize: 8 }, conversationActions: { alignItems: "flex-end", justifyContent: "center", gap: 5 }, deliveryStatus: { color: colors.subtle, fontSize: 7, fontWeight: "700" },
});