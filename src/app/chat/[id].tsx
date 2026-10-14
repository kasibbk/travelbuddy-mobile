import { useEffect, useState } from "react";
import { ArrowLeft, MessageCircle, MoreHorizontal, Send } from "lucide-react-native";
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useAuth } from "../../components/auth-provider";
import { EmptyState } from "../../components/empty-state";
import { Avatar } from "../../components/avatar";
import { colors } from "../../components/theme";
import { ConversationData, loadConversations, loadMessages, MessageData, sendMessage } from "../../lib/app-data";

export default function ChatScreen() {
  const router = useRouter();
  const { id, title: routeTitle } = useLocalSearchParams<{ id: string; title?: string }>();
  const { ready, userId } = useAuth();
  const [conversation, setConversation] = useState<ConversationData | null>(null);
  const [messages, setMessages] = useState<MessageData[]>([]);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!ready) return;
    if (!userId || !id || Array.isArray(id)) {
      setConversation(null);
      setMessages([]);
      setError("");
      setLoading(false);
      return;
    }

    let active = true;
    setLoading(true);
    setError("");
    loadConversations(userId).then(async (rows) => {
      const selected = rows.find((row) => row.id === id);
      if (!selected) {
        if (active) setError("This conversation isn’t available to your account.");
        return;
      }
      const thread = await loadMessages(id);
      if (active) {
        setConversation(selected);
        setMessages(thread);
      }
    }).catch((cause: unknown) => {
      if (active) setError(cause instanceof Error ? cause.message : "Could not load this conversation.");
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [ready, userId, id]);

  const title = routeTitle || conversation?.title || "Conversation";
  const initials = title.split(/\s+/).map((part) => part[0]).join("").slice(0, 2).toUpperCase();

  async function submitMessage() {
    const body = draft.trim();
    if (!conversation || !userId || !body || body.length > 5000 || sending) return;
    setSending(true);
    setSendError("");
    setDraft("");
    try {
      const message = await sendMessage(conversation.id, userId, body);
      setMessages((current) => [...current, message]);
    } catch (cause) {
      setDraft(body);
      setSendError(cause instanceof Error ? cause.message : "Could not send your message.");
    } finally {
      setSending(false);
    }
  }

  return <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === "ios" ? "padding" : undefined}>
    <View style={styles.header}><Pressable accessibilityLabel="Back to messages" style={styles.back} onPress={() => router.back()}><ArrowLeft color={colors.ink} size={19} /></Pressable><Pressable accessibilityRole="button" accessibilityLabel={`Open details for ${title}`} disabled={!conversation} onPress={() => conversation && router.push({ pathname: "/chat-details/[id]", params: { id: conversation.id } })} style={styles.headerDetails}><Avatar initials={initials || "?"} color={colors.leaf} size={38} /><View style={styles.headerText}><Text numberOfLines={1} style={styles.name}>{title}</Text><Text style={styles.subline}>{conversation?.detail ?? "TravelBuddy conversation"}</Text></View></Pressable><Pressable accessibilityLabel="More options" disabled style={[styles.more, styles.moreDisabled]}><MoreHorizontal color={colors.muted} size={20} /></Pressable></View>
    <ScrollView style={styles.messages} contentContainerStyle={styles.messageContent}>
      {loading ? <ActivityIndicator color={colors.leaf} style={styles.loader} /> : error ? <EmptyState icon={MessageCircle} title="Conversation unavailable" description={error} /> : messages.length ? messages.map((message) => {
        const mine = message.senderId === userId;
        return <View key={message.id} style={[styles.bubble, mine ? styles.myBubble : styles.otherBubble]}><Text style={styles.message}>{message.body}</Text><Text style={styles.messageTime}>{new Date(message.createdAt).toLocaleString(undefined, { hour: "numeric", minute: "2-digit" })}</Text></View>;
      }) : <EmptyState icon={MessageCircle} title="No messages yet" description="Messages for this conversation will appear here." />}
    </ScrollView>
    {!!conversation && !error && !loading && <View style={styles.composer}><View style={styles.composerField}><TextInput value={draft} onChangeText={setDraft} placeholder="Write a message" placeholderTextColor={colors.subtle} multiline maxLength={5000} editable={!sending} style={styles.composerInput} /></View><Pressable accessibilityLabel="Send message" accessibilityState={{ disabled: !draft.trim() || sending }} disabled={!draft.trim() || sending} onPress={submitMessage} style={[styles.sendButton, (!draft.trim() || sending) && styles.sendButtonDisabled]}>{sending ? <ActivityIndicator size="small" color={colors.surface} /> : <Send color={colors.surface} size={16} />}</Pressable>{!!sendError && <Text accessibilityRole="alert" style={styles.sendError}>{sendError}</Text>}</View>}
  </KeyboardAvoidingView>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.paper },
  header: { minHeight: 66, paddingHorizontal: 14, borderBottomWidth: 1, borderBottomColor: colors.line, backgroundColor: colors.surface, flexDirection: "row", alignItems: "center", gap: 9 },
  back: { width: 28, height: 38, alignItems: "flex-start", justifyContent: "center" },
  headerDetails: { flex: 1, minWidth: 0, flexDirection: "row", alignItems: "center", gap: 9 },
  headerText: { flex: 1, gap: 3 },
  name: { color: colors.ink, fontSize: 11, fontWeight: "700" },
  subline: { color: colors.muted, fontSize: 8 },
  more: { width: 30, height: 35, alignItems: "center", justifyContent: "center" },
  moreDisabled: { opacity: 0.65 },
  messages: { flex: 1 },
  messageContent: { flexGrow: 1, gap: 13, padding: 16, paddingBottom: 24 },
  composer: { paddingHorizontal: 12, paddingTop: 9, paddingBottom: Platform.OS === "ios" ? 20 : 10, borderTopWidth: 1, borderTopColor: colors.line, backgroundColor: colors.surface, flexDirection: "row", alignItems: "flex-end", gap: 8, flexWrap: "wrap" },
  composerField: { flex: 1, minHeight: 42, maxHeight: 120, paddingHorizontal: 11, borderWidth: 1, borderColor: colors.line, borderRadius: 9, backgroundColor: colors.paper, justifyContent: "center" },
  composerInput: { minHeight: 24, maxHeight: 100, paddingVertical: 6, color: colors.ink, fontSize: 10, lineHeight: 15 },
  sendButton: { width: 42, height: 42, borderRadius: 11, alignItems: "center", justifyContent: "center", backgroundColor: colors.forest },
  sendButtonDisabled: { opacity: 0.5 },
  sendError: { width: "100%", color: "#9B493C", fontSize: 8, lineHeight: 12 },
  loader: { marginVertical: 28 },
  bubble: { maxWidth: "84%", padding: 11, borderWidth: 1, borderColor: colors.line, borderTopLeftRadius: 4, borderTopRightRadius: 13, borderBottomRightRadius: 13, borderBottomLeftRadius: 13 },
  otherBubble: { alignSelf: "flex-start", backgroundColor: colors.surface },
  myBubble: { alignSelf: "flex-end", borderColor: "#DFE8D6", borderTopLeftRadius: 13, borderTopRightRadius: 4, backgroundColor: "#EAF0DF" },
  message: { color: "#40554A", fontSize: 10, lineHeight: 15 },
  messageTime: { marginTop: 6, color: colors.subtle, fontSize: 7, textAlign: "right" },
});