import { useCallback, useMemo, useState } from "react";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { ArrowLeft, Check, Forward, MessageCircle, Search, Users, X } from "lucide-react-native";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Avatar } from "../components/avatar";
import { EmptyState } from "../components/empty-state";
import { colors } from "../components/theme";
import { useAuth } from "../components/auth-provider";
import {
  ConversationData,
  getImagePublicUrl,
  getMessageImageUrl,
  loadConversations,
  loadMessages,
  MessageData,
  sendMessage,
  uploadMessageMedia,
} from "../lib/app-data";

function getErrorMessage(cause: unknown, fallback: string): string {
  if (cause instanceof Error) return cause.message;
  if (cause && typeof cause === "object" && "message" in cause && typeof cause.message === "string") {
    return cause.message;
  }
  return fallback;
}

export default function ShareScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { sourceConversationId: sourceConversationParam, messageId: messageParam } = useLocalSearchParams<{
    sourceConversationId: string;
    messageId: string;
  }>();
  const sourceConversationId = typeof sourceConversationParam === "string" ? sourceConversationParam : null;
  const messageId = typeof messageParam === "string" ? messageParam : null;
  const { ready, userId } = useAuth();
  const [conversations, setConversations] = useState<ConversationData[]>([]);
  const [sourceMessage, setSourceMessage] = useState<MessageData | null>(null);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [selectedConversationIds, setSelectedConversationIds] = useState<string[]>([]);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  useFocusEffect(useCallback(() => {
    if (!ready || !userId || !sourceConversationId || !messageId) return;
    let active = true;
    setLoading(true);
    setError("");
    Promise.all([
      loadConversations(userId, true),
      loadMessages(sourceConversationId, userId, true),
    ]).then(([rows, messages]) => {
      if (!active) return;
      const selectedMessage = messages.find((message) => message.id === messageId) ?? null;
      if (!selectedMessage) throw new Error("This message is no longer available to forward.");
      setConversations(rows);
      setSourceMessage(selectedMessage);
      setSelectedConversationIds([]);
    }).catch((cause: unknown) => {
      if (active) setError(getErrorMessage(cause, "Could not load the share page."));
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => { active = false; };
  }, [ready, userId, sourceConversationId, messageId]));

  const visibleConversations = useMemo(() => {
    const query = search.trim().toLocaleLowerCase();
    return conversations.filter((conversation) =>
      !query || `${conversation.title} ${conversation.lastMessage}`.toLocaleLowerCase().includes(query));
  }, [conversations, search]);

  function toggleConversation(conversationId: string) {
    setSelectedConversationIds((selected) => selected.includes(conversationId)
      ? selected.filter((id) => id !== conversationId)
      : [...selected, conversationId]);
    setError("");
    setNotice("");
  }

  async function forwardToSelected() {
    if (!userId || !sourceMessage || !sourceConversationId || sending || selectedConversationIds.length === 0) return;
    const targets = conversations.filter((conversation) => selectedConversationIds.includes(conversation.id));
    if (targets.length === 0) return;
    setSending(true);
    setError("");
    setNotice("");
    try {
      const signedUrl = sourceMessage.attachmentPath
        ? sourceMessage.attachmentUrl ?? await getMessageImageUrl(sourceMessage.attachmentPath)
        : null;
      const results = await Promise.allSettled(targets.map(async (conversation) => {
        const attachmentPath = sourceMessage.attachmentPath && signedUrl
          ? await uploadMessageMedia(userId, conversation.id, { uri: signedUrl })
          : null;
        const body = sourceMessage.body === "Photo" && attachmentPath ? "" : sourceMessage.body;
        await sendMessage(conversation.id, userId, body, { attachmentPath, isForwarded: true });
        return conversation.id;
      }));
      const successfulIds = new Set(results.flatMap((result) =>
        result.status === "fulfilled" ? [result.value] : []));
      const failedTargets = targets.filter((conversation) => !successfulIds.has(conversation.id));
      setSelectedConversationIds(failedTargets.map((conversation) => conversation.id));
      const forwardedCount = successfulIds.size;
      if (forwardedCount > 0) {
        setNotice(`Forwarded to ${forwardedCount} ${forwardedCount === 1 ? "chat" : "chats"}.`);
      }
      if (failedTargets.length > 0) {
        const failedIndex = targets.findIndex((conversation) => conversation.id === failedTargets[0].id);
        const failedResult = results[failedIndex];
        const reason = failedResult?.status === "rejected"
          ? getErrorMessage(failedResult.reason, "Could not forward this message.")
          : "Could not forward this message.";
        setError(`Could not forward to ${failedTargets.map((conversation) => conversation.title).join(", ")}. ${reason}`);
      } else {
        router.replace({ pathname: "/chat/[id]", params: { id: sourceConversationId } });
      }
    } catch (cause) {
      setError(getErrorMessage(cause, "Could not forward this message."));
    } finally {
      setSending(false);
    }
  }

  return <View style={styles.screen}>
    <View style={[styles.header, { paddingTop: Math.max(8, insets.top + 6) }]}>
      <Pressable accessibilityRole="button" accessibilityLabel="Back" onPress={() => router.back()} style={styles.back}>
        <ArrowLeft color={colors.ink} size={19} />
      </Pressable>
      <View style={styles.heading}>
        <Text style={styles.title}>Share to a chat</Text>
        <Text style={styles.subtitle}>Choose where to send this message or photo.</Text>
      </View>
    </View>
    {sourceMessage && <View style={styles.sourceCard}>
      <Forward color={colors.forest} size={16} />
      <Text numberOfLines={2} style={styles.sourceText}>{sourceMessage.attachmentPath && sourceMessage.body === "Photo" ? "Photo" : sourceMessage.body}</Text>
    </View>}
    <View style={styles.searchBar}>
      <Search color={colors.muted} size={17} />
      <TextInput value={search} onChangeText={setSearch} placeholder="Search chats" placeholderTextColor={colors.subtle} returnKeyType="search" style={styles.searchInput} />
      {!!search && <Pressable accessibilityRole="button" accessibilityLabel="Clear chat search" onPress={() => setSearch("")}><X color={colors.muted} size={17} /></Pressable>}
    </View>
    {!!error && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
    {!!notice && <Text accessibilityLiveRegion="polite" style={styles.notice}>{notice}</Text>}
    {loading ? <ActivityIndicator color={colors.leaf} style={styles.loader} /> : error && !sourceMessage
      ? <EmptyState icon={MessageCircle} title="Share unavailable" description={error} />
      : visibleConversations.length
        ? <ScrollView style={styles.conversationList} contentContainerStyle={styles.list}>
          {visibleConversations.map((conversation) => {
            const initials = conversation.title.split(/\s+/).map((part) => part[0]).join("").slice(0, 2).toUpperCase();
            const selected = selectedConversationIds.includes(conversation.id);
            return <Pressable key={conversation.id} accessibilityRole="checkbox" accessibilityState={{ checked: selected, disabled: sending }} disabled={!sourceMessage || sending} onPress={() => toggleConversation(conversation.id)} style={[styles.conversation, sending && styles.dimmed]}>
              <View style={styles.avatar}>
                <Avatar initials={initials} imageUrl={conversation.kind === "direct" ? getImagePublicUrl("profile-images", conversation.avatarPath) : null} color={colors.leaf} size={42} />
                {conversation.kind !== "direct" && <View style={styles.groupMark}><Users color={colors.surface} size={9} /></View>}
              </View>
              <View style={styles.conversationCopy}>
                <Text numberOfLines={1} style={styles.conversationTitle}>{conversation.title}</Text>
                <Text numberOfLines={1} style={styles.conversationDetail}>{conversation.lastMessage}</Text>
              </View>
              <View style={[styles.selectionIndicator, selected && styles.selectionIndicatorSelected]}>
                {selected && <Check color={colors.surface} size={13} />}
              </View>
            </Pressable>;
          })}
        </ScrollView>
        : <EmptyState icon={MessageCircle} title={search ? "No matching chats" : "No chats available"} description={search ? "Try another chat name." : "Your conversations will appear here."} />}
    {!loading && !!sourceMessage && conversations.length > 0 && <View style={[styles.footer, { paddingBottom: Math.max(12, insets.bottom) }]}>
      <Text style={styles.selectionCount}>{selectedConversationIds.length === 0
        ? "Select one or more chats"
        : `${selectedConversationIds.length} ${selectedConversationIds.length === 1 ? "chat" : "chats"} selected`}</Text>
      <Pressable accessibilityRole="button" disabled={selectedConversationIds.length === 0 || sending} onPress={() => void forwardToSelected()} style={[styles.forwardButton, (selectedConversationIds.length === 0 || sending) && styles.forwardButtonDisabled]}>
        {sending ? <ActivityIndicator size="small" color={colors.surface} /> : <Forward color={colors.surface} size={16} />}
        <Text style={styles.forwardButtonText}>Forward</Text>
      </Pressable>
    </View>}
  </View>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.paper },
  header: { minHeight: 72, paddingHorizontal: 15, paddingBottom: 10, flexDirection: "row", alignItems: "center", gap: 11 },
  back: { width: 36, height: 38, alignItems: "center", justifyContent: "center", borderRadius: 10, backgroundColor: colors.surface },
  heading: { flex: 1, gap: 3 },
  title: { color: colors.ink, fontSize: 15, fontWeight: "800" },
  subtitle: { color: colors.muted, fontSize: 9 },
  sourceCard: { marginHorizontal: 16, marginTop: 4, padding: 11, borderWidth: 1, borderColor: colors.line, borderRadius: 11, backgroundColor: colors.surface, flexDirection: "row", alignItems: "center", gap: 9 },
  sourceText: { flex: 1, color: colors.ink, fontSize: 10, lineHeight: 14 },
  searchBar: { minHeight: 44, marginHorizontal: 16, marginTop: 12, marginBottom: 9, paddingHorizontal: 12, borderWidth: 1, borderColor: colors.line, borderRadius: 12, backgroundColor: colors.surface, flexDirection: "row", alignItems: "center", gap: 9 },
  searchInput: { flex: 1, minWidth: 0, paddingVertical: 8, color: colors.ink, fontSize: 11 },
  error: { marginHorizontal: 16, marginVertical: 5, color: "#9B493C", fontSize: 9 },
  notice: { marginHorizontal: 16, marginVertical: 5, color: colors.forest, fontSize: 9 },
  loader: { marginTop: 28 },
  conversationList: { flex: 1 },
  list: { paddingHorizontal: 16, paddingBottom: 20 },
  conversation: { minHeight: 68, paddingHorizontal: 9, borderBottomWidth: 1, borderBottomColor: colors.line, flexDirection: "row", alignItems: "center", gap: 10 },
  dimmed: { opacity: 0.7 },
  avatar: { position: "relative" },
  selectionIndicator: { width: 21, height: 21, borderWidth: 1, borderColor: colors.line, borderRadius: 11, alignItems: "center", justifyContent: "center", backgroundColor: colors.surface },
  selectionIndicatorSelected: { borderColor: colors.forest, backgroundColor: colors.forest },
  groupMark: { position: "absolute", right: -3, bottom: -2, width: 18, height: 18, borderRadius: 9, alignItems: "center", justifyContent: "center", borderWidth: 2, borderColor: colors.paper, backgroundColor: colors.forest },
  conversationCopy: { flex: 1, gap: 4 },
  conversationTitle: { color: colors.ink, fontSize: 11, fontWeight: "800" },
  conversationDetail: { color: colors.muted, fontSize: 8 },
  footer: { paddingTop: 10, paddingHorizontal: 16, borderTopWidth: 1, borderTopColor: colors.line, backgroundColor: colors.surface, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 },
  selectionCount: { flex: 1, color: colors.muted, fontSize: 9, fontWeight: "700" },
  forwardButton: { minWidth: 105, minHeight: 42, paddingHorizontal: 15, borderRadius: 11, backgroundColor: colors.forest, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 7 },
  forwardButtonDisabled: { opacity: 0.45 },
  forwardButtonText: { color: colors.surface, fontSize: 10, fontWeight: "800" },
});
