import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowLeft, MessageCircle, MoreHorizontal, Send } from "lucide-react-native";
import { ActivityIndicator, AppState, Keyboard, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "../../components/auth-provider";
import { useStoreVersion } from "../../lib/store-events";
import { setForegroundConversation } from "../../lib/notifications";
import { supabase } from "../../lib/supabase";
import { EmptyState } from "../../components/empty-state";
import { Avatar } from "../../components/avatar";
import { colors } from "../../components/theme";
import { ConversationData, loadConversationParticipants, loadConversations, loadMessages, markConversationRead, MessageData, sendMessage, setConversationActive, syncMessages } from "../../lib/app-data";

const COMPOSER_FIELD_MIN_HEIGHT = 42;

export default function ChatScreen() {
  const router = useRouter();
  const { id, title: routeTitle } = useLocalSearchParams<{ id: string; title?: string }>();
  const { ready, userId } = useAuth();
  const [conversation, setConversation] = useState<ConversationData | null>(null);
  const [messages, setMessages] = useState<MessageData[]>([]);
  const [senderNames, setSenderNames] = useState<Record<string, string>>({});
  const [typingUsers, setTypingUsers] = useState<{ userId: string; displayName: string }[]>([]);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [keyboardVisible, setKeyboardVisible] = useState(false);
  const [sendError, setSendError] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const storeVersion = useStoreVersion();
  const messagesRef = useRef<ScrollView>(null);
  const typingChannelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const typingActiveRef = useRef(false);
  const insets = useSafeAreaInsets();

  useEffect(() => {
    if (ready && userId && id && !Array.isArray(id)) void syncMessages(id, userId).catch(() => undefined);
  }, [ready, userId, id]);

  useEffect(() => {
    if (!ready) return;
    if (!userId || !id || Array.isArray(id)) {
      setConversation(null);
      setMessages([]);
      setSenderNames({});
      setError("");
      setLoading(false);
      return;
    }

    let active = true;
    setError("");
    loadConversations(userId).then(async (rows) => {
      const selected = rows.find((row) => row.id === id);
      if (!selected) {
        if (active) setError("This conversation isn’t available to your account.");
        return;
      }
      const [thread, participants] = await Promise.all([
        loadMessages(id, userId),
        loadConversationParticipants(id, userId),
      ]);
      if (active) {
        setConversation(selected);
        setMessages(thread);
        setSenderNames(Object.fromEntries(participants.map((participant) => [participant.userId, participant.displayName])));
      }
    }).catch((cause: unknown) => {
      if (active) setError(cause instanceof Error ? cause.message : "Could not load this conversation.");
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [ready, userId, id, storeVersion]);

  useFocusEffect(useCallback(() => {
    if (!ready || !userId || !conversation || loading || conversation.id !== id) return;
    let active = true;
    const channel = supabase.channel(`typing:${conversation.id}`, {
      config: { private: true, presence: { key: userId } },
    });
    typingChannelRef.current = channel;
    const updateTypingUsers = () => {
      const nextUsers = new Map<string, { userId: string; displayName: string }>();
      const presence = channel.presenceState<{ userId?: string; displayName?: string; typing?: boolean }>();
      for (const [presenceKey, metas] of Object.entries(presence)) {
        for (const meta of metas) {
          const typingUserId = meta.userId ?? presenceKey;
          if (meta.typing && typingUserId !== userId) {
            nextUsers.set(typingUserId, {
              userId: typingUserId,
              displayName: meta.displayName || senderNames[typingUserId] || "Rider",
            });
          }
        }
      }
      if (active) setTypingUsers([...nextUsers.values()]);
    };
    channel.on("presence", { event: "sync" }, updateTypingUsers);
    channel.subscribe((status, error) => {
      if (!active) return;
      if (status === "SUBSCRIBED" && typingActiveRef.current) {
        void channel.track({
          userId,
          displayName: senderNames[userId] ?? "Rider",
          typing: true,
        }).then((result) => {
          if (result !== "ok") console.warn("[chat] Could not publish typing presence", result);
        }).catch((cause: unknown) => console.warn("[chat] Could not publish typing presence", cause));
      } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
        console.warn("[chat] Typing presence subscription unavailable", error);
      }
    });
    return () => {
      active = false;
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
      typingTimeoutRef.current = null;
      typingActiveRef.current = false;
      setTypingUsers([]);
      if (typingChannelRef.current === channel) typingChannelRef.current = null;
      void supabase.removeChannel(channel).catch((cause: unknown) => console.warn("[chat] Could not close typing presence", cause));
    };
  }, [ready, userId, conversation, loading, id, senderNames]));

  useEffect(() => {
    if (loading) return;
    const frame = requestAnimationFrame(() => messagesRef.current?.scrollToEnd({ animated: false }));
    return () => cancelAnimationFrame(frame);
  }, [loading, messages.length]);

  const conversationId = conversation?.id;
  const lastMessageAt = messages[messages.length - 1]?.createdAt;
  useEffect(() => {
    if (loading || !conversationId || !userId || !lastMessageAt) return;
    void markConversationRead(conversationId, userId, lastMessageAt)
      .catch((cause: unknown) => console.warn("[chat] Could not mark messages as read", cause));
  }, [conversationId, lastMessageAt, loading, userId]);

  useEffect(() => {
    const subscription = Keyboard.addListener("keyboardDidShow", () => {
      setKeyboardVisible(true);
      requestAnimationFrame(() => messagesRef.current?.scrollToEnd({ animated: true }));
    });
    const hideSubscription = Keyboard.addListener("keyboardDidHide", () => setKeyboardVisible(false));
    return () => {
      subscription.remove();
      hideSubscription.remove();
    };
  }, []);

  useFocusEffect(useCallback(() => {
    if (!ready || !userId || !id || Array.isArray(id)) return;
    setForegroundConversation(id);
    return () => setForegroundConversation(null);
  }, [ready, userId, id]));

  useFocusEffect(useCallback(() => {
    if (!ready || !userId || !id || Array.isArray(id) || conversation?.id !== id) return;
    const sessionId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const updatePresence = (active: boolean) => {
      void setConversationActive(id, sessionId, active)
        .catch((cause: unknown) => console.warn("[chat] Could not update active conversation presence", cause));
    };
    updatePresence(AppState.currentState === "active");
    const appStateSubscription = AppState.addEventListener("change", (state) => updatePresence(state === "active"));
    const heartbeat = setInterval(() => {
      if (AppState.currentState === "active") updatePresence(true);
    }, 15_000);
    return () => {
      clearInterval(heartbeat);
      appStateSubscription.remove();
      void setConversationActive(id, sessionId, false)
        .catch((cause: unknown) => console.warn("[chat] Could not clear active conversation presence", cause));
    };
  }, [ready, userId, id, conversation?.id]));

  const title = routeTitle || conversation?.title || "Conversation";
  const initials = title.split(/\s+/).map((part) => part[0]).join("").slice(0, 2).toUpperCase();

  function publishTypingPresence(typing: boolean) {
    typingActiveRef.current = typing;
    const channel = typingChannelRef.current;
    if (!channel || !userId) return;
    const update = typing
      ? channel.track({ userId, displayName: senderNames[userId] ?? "Rider", typing: true })
      : channel.untrack();
    void update.then((result) => {
      if (result !== "ok") console.warn("[chat] Could not update typing presence", result);
    }).catch((cause: unknown) => console.warn("[chat] Could not update typing presence", cause));
  }

  function handleDraftChange(value: string) {
    setDraft(value);
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    if (!value.trim()) {
      typingTimeoutRef.current = null;
      publishTypingPresence(false);
      return;
    }
    if (!typingActiveRef.current) publishTypingPresence(true);
    typingTimeoutRef.current = setTimeout(() => {
      typingTimeoutRef.current = null;
      publishTypingPresence(false);
    }, 2000);
  }

  async function submitMessage() {
    const body = draft.trim();
    if (!conversation || !userId || !body || body.length > 5000 || sending) return;
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = null;
    publishTypingPresence(false);
    setSending(true);
    setSendError("");
    setDraft("");
    try {
      const message = await sendMessage(conversation.id, userId, body);
      setMessages((current) => current.some((item) => item.id === message.id) ? current : [...current, message]);
    } catch (cause) {
      handleDraftChange(body);
      setSendError(cause instanceof Error ? cause.message : "Could not send your message.");
    } finally {
      setSending(false);
    }
  }

  return <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === "ios" ? "padding" : Platform.OS === "android" ? "height" : undefined}>
    <View style={styles.header}><Pressable accessibilityLabel="Back to messages" style={styles.back} onPress={() => router.back()}><ArrowLeft color={colors.ink} size={19} /></Pressable><Pressable accessibilityRole="button" accessibilityLabel={`Open details for ${title}`} disabled={!conversation} onPress={() => conversation && router.push({ pathname: "/chat-details/[id]", params: { id: conversation.id } })} style={styles.headerDetails}><Avatar initials={initials || "?"} color={colors.leaf} size={38} /><View style={styles.headerText}><Text numberOfLines={1} style={styles.name}>{title}</Text></View></Pressable><Pressable accessibilityLabel="More options" disabled style={[styles.more, styles.moreDisabled]}><MoreHorizontal color={colors.muted} size={20} /></Pressable></View>
    <ScrollView ref={messagesRef} style={styles.messages} contentContainerStyle={styles.messageContent} onLayout={() => messagesRef.current?.scrollToEnd({ animated: false })} onContentSizeChange={() => messagesRef.current?.scrollToEnd({ animated: false })} keyboardShouldPersistTaps="handled">
      {loading ? <ActivityIndicator color={colors.leaf} style={styles.loader} /> : error ? <EmptyState icon={MessageCircle} title="Conversation unavailable" description={error} /> : messages.length ? messages.map((message) => {
        const mine = message.senderId === userId;
        const senderName = conversation?.kind === "ride"
          ? mine ? null : senderNames[message.senderId] ?? "Rider"
          : null;
        const deliveryStatus = mine ? message.deliveryStatus ?? "sent" : null;
        return <View key={message.id} style={[styles.bubble, mine ? styles.myBubble : styles.otherBubble]}>{senderName && <Text style={styles.senderName}>{senderName}</Text>}<Text style={styles.message}>{message.body}</Text><Text style={styles.messageTime}>{new Date(message.createdAt).toLocaleString(undefined, { hour: "numeric", minute: "2-digit" })}</Text>{deliveryStatus && <Text style={styles.deliveryStatus}>{deliveryStatus[0].toUpperCase() + deliveryStatus.slice(1)}</Text>}</View>;
      }) : <EmptyState icon={MessageCircle} title="No messages yet" description="Messages for this conversation will appear here." />}
    </ScrollView>
    {typingUsers.length > 0 && <Text accessibilityLiveRegion="polite" style={styles.typingIndicator}>{conversation?.kind === "direct"
      ? "Typing..."
      : `${typingUsers.map((person) => person.displayName).join(", ")} ${typingUsers.length === 1 ? "is" : "are"} typing...`}</Text>}
    {!!conversation && !error && !loading && <View style={[styles.composer, { paddingBottom: keyboardVisible ? 10 + COMPOSER_FIELD_MIN_HEIGHT * 0.6 : Math.max(10, insets.bottom) }]}><View style={styles.composerField}><TextInput value={draft} onChangeText={handleDraftChange} placeholder="Write a message" placeholderTextColor={colors.subtle} multiline maxLength={5000} editable={!sending} style={styles.composerInput} /></View><Pressable accessibilityLabel="Send message" accessibilityState={{ disabled: !draft.trim() || sending }} disabled={!draft.trim() || sending} onPress={submitMessage} style={[styles.sendButton, (!draft.trim() || sending) && styles.sendButtonDisabled]}>{sending ? <ActivityIndicator size="small" color={colors.surface} /> : <Send color={colors.surface} size={16} />}</Pressable>{!!sendError && <Text accessibilityRole="alert" style={styles.sendError}>{sendError}</Text>}</View>}
  </KeyboardAvoidingView>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.paper },
  header: { minHeight: 66, paddingHorizontal: 14, borderBottomWidth: 1, borderBottomColor: colors.line, backgroundColor: colors.surface, flexDirection: "row", alignItems: "center", gap: 9 },
  back: { width: 28, height: 38, alignItems: "flex-start", justifyContent: "center" },
  headerDetails: { flex: 1, minWidth: 0, flexDirection: "row", alignItems: "center", gap: 9 },
  headerText: { flex: 1, gap: 3 },
  name: { color: colors.ink, fontSize: 11, fontWeight: "700" },
  more: { width: 30, height: 35, alignItems: "center", justifyContent: "center" },
  moreDisabled: { opacity: 0.65 },
  messages: { flex: 1 },
  messageContent: { flexGrow: 1, gap: 13, padding: 16, paddingBottom: 24 },
  composer: { paddingHorizontal: 12, paddingTop: 9, paddingBottom: Platform.OS === "ios" ? 20 : 10, borderTopWidth: 1, borderTopColor: colors.line, backgroundColor: colors.surface, flexDirection: "row", alignItems: "flex-end", gap: 8, flexWrap: "wrap" },
  composerField: { flex: 1, minHeight: COMPOSER_FIELD_MIN_HEIGHT, maxHeight: 120, paddingHorizontal: 11, borderWidth: 1, borderColor: colors.line, borderRadius: 9, backgroundColor: colors.paper, justifyContent: "center" },
  composerInput: { minHeight: 24, maxHeight: 100, paddingVertical: 6, color: colors.ink, fontSize: 10, lineHeight: 15 },
  sendButton: { width: 42, height: 42, borderRadius: 11, alignItems: "center", justifyContent: "center", backgroundColor: colors.forest },
  sendButtonDisabled: { opacity: 0.5 },
  sendError: { width: "100%", color: "#9B493C", fontSize: 8, lineHeight: 12 },
  loader: { marginVertical: 28 },
  bubble: { maxWidth: "84%", padding: 11, borderWidth: 1, borderColor: colors.line, borderTopLeftRadius: 4, borderTopRightRadius: 13, borderBottomRightRadius: 13, borderBottomLeftRadius: 13 },
  otherBubble: { alignSelf: "flex-start", backgroundColor: colors.surface },
  myBubble: { alignSelf: "flex-end", borderColor: "#DFE8D6", borderTopLeftRadius: 13, borderTopRightRadius: 4, backgroundColor: "#EAF0DF" },
  message: { color: "#40554A", fontSize: 10, lineHeight: 15 },
  senderName: { marginBottom: 4, color: colors.forest, fontSize: 8, fontWeight: "800" },
  messageTime: { marginTop: 6, color: colors.subtle, fontSize: 7, textAlign: "right" },
  deliveryStatus: { marginTop: 2, color: colors.subtle, fontSize: 7, fontWeight: "700", textAlign: "right" },
  typingIndicator: { paddingHorizontal: 16, paddingVertical: 7, color: colors.muted, fontSize: 8, fontStyle: "italic" },
});