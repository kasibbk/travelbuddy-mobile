import { useCallback, useEffect, useRef, useState } from "react";
import * as ImagePicker from "expo-image-picker";
import * as DocumentPicker from "expo-document-picker";
import { Alert, ActivityIndicator, AppState, Image, Keyboard, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { ArrowLeft, BellOff, ChevronsUp, FileText, Film, Forward, ImagePlus, LogOut, MessageCircle, MoreHorizontal, Music2, Paintbrush, Paperclip, Reply, Search, Send, Trash2, UserPlus, Users, X } from "lucide-react-native";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "../../components/auth-provider";
import { setForegroundConversation } from "../../lib/notifications";
import { supabase } from "../../lib/supabase";
import { EmptyState } from "../../components/empty-state";
import { Avatar } from "../../components/avatar";
import { ImagePreviewModal } from "../../components/image-preview-modal";
import { VideoAttachmentThumbnail } from "../../components/video-attachment-thumbnail";
import { colors } from "../../components/theme";
import { useStoreVersion } from "../../lib/store-events";
import { ChatBackground, clearConversationMessages, ConversationData, getAttachmentKind, getImagePublicUrl, ImageUploadAsset, leaveGroupConversation, loadConversationParticipants, loadConversations, loadMessages, markConversationRead, MAX_MESSAGE_ATTACHMENT_SIZE_BYTES, MessageData, restoreConversation, sendMessage, setConversationActive, syncMessages, updateConversationPreferences, uploadMessageMedia } from "../../lib/app-data";

const COMPOSER_FIELD_MIN_HEIGHT = 42;
const CHAT_BACKGROUNDS: Record<ChatBackground, { label: string; color: string }> = {
  default: { label: "Default", color: "#F7F8F3" },
  forest: { label: "Forest", color: "#E8F0E7" },
  ocean: { label: "Ocean", color: "#E8F1F7" },
  rose: { label: "Rose", color: "#F8ECEC" },
  sand: { label: "Sand", color: "#F5EFE2" },
  lavender: { label: "Lavender", color: "#F0EDF8" },
};

function getReplyChain(message: MessageData, messages: MessageData[]): MessageData[] {
  const chain: MessageData[] = [];
  const seen = new Set<string>([message.id]);
  let replyToId = message.replyToMessageId;
  while (replyToId && !seen.has(replyToId)) {
    seen.add(replyToId);
    const repliedMessage = messages.find((item) => item.id === replyToId);
    if (!repliedMessage) break;
    chain.push(repliedMessage);
    replyToId = repliedMessage.replyToMessageId;
  }
  return chain.reverse();
}

function getAttachmentLabel(message: MessageData): string {
  if (message.attachmentName) return message.attachmentName;
  return getAttachmentKind(message.attachmentMimeType, null, message.attachmentPath) === "image" ? "Photo" : "Attachment";
}

function formatAttachmentSize(bytes: number | null | undefined): string | null {
  if (bytes == null || !Number.isFinite(bytes)) return null;
  return bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function ChatScreen() {
  const router = useRouter();
  const { id, title: routeTitle } = useLocalSearchParams<{ id: string; title?: string }>();
  const { ready, userId } = useAuth();
  const storeVersion = useStoreVersion();
  const [conversation, setConversation] = useState<ConversationData | null>(null);
  const [messages, setMessages] = useState<MessageData[]>([]);
  const [senderNames, setSenderNames] = useState<Record<string, string>>({});
  const [senderAvatarPaths, setSenderAvatarPaths] = useState<Record<string, string | null>>({});
  const [typingUsers, setTypingUsers] = useState<{ userId: string; displayName: string }[]>([]);
  const [draft, setDraft] = useState("");
  const [attachmentAsset, setAttachmentAsset] = useState<ImageUploadAsset | null>(null);
  const [attachmentPickerOpen, setAttachmentPickerOpen] = useState(false);
  const [replyTarget, setReplyTarget] = useState<MessageData | null>(null);
  const [selectedMessage, setSelectedMessage] = useState<MessageData | null>(null);
  const [replyChainTarget, setReplyChainTarget] = useState<MessageData | null>(null);
  const [previewImage, setPreviewImage] = useState<{ uri: string; label: string } | null>(null);
  const [chatMenuOpen, setChatMenuOpen] = useState(false);
  const [muteOptionsOpen, setMuteOptionsOpen] = useState(false);
  const [backgroundOptionsOpen, setBackgroundOptionsOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [chatActionError, setChatActionError] = useState("");
  const [sending, setSending] = useState(false);
  const [keyboardVisible, setKeyboardVisible] = useState(false);
  const [sendError, setSendError] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [avatarPreviewOpen, setAvatarPreviewOpen] = useState(false);
  const messagesRef = useRef<ScrollView>(null);
  const searchInputRef = useRef<TextInput>(null);
  const messageOffsetsRef = useRef<Record<string, number>>({});
  const typingChannelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const typingActiveRef = useRef(false);
  const insets = useSafeAreaInsets();

  useEffect(() => {
    if (ready && userId && id && !Array.isArray(id)) void syncMessages(id, userId).catch(() => undefined);
  }, [ready, userId, id]);

  useEffect(() => {
    if (!ready) return;
    let active = true;
    if (!userId || !id || Array.isArray(id)) {
      async function clearUnavailableConversation() {
        await Promise.resolve();
        if (!active) return;
        setConversation(null);
        setMessages([]);
        setSenderNames({});
        setSenderAvatarPaths({});
        setError("");
        setLoading(false);
      }
      void clearUnavailableConversation();
      return () => { active = false; };
    }

    restoreConversation(id).then(() => loadConversations(userId, true)).then(async (rows) => {
      if (active) setError("");
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
        setSenderAvatarPaths(Object.fromEntries(participants.map((participant) => [participant.userId, participant.avatarPath])));
      }
    }).catch((cause: unknown) => {
      if (active) setError(cause instanceof Error ? cause.message : "Could not load this conversation.");
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [ready, userId, id]);

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
    if (loading || !conversationId || !userId) return;
    let active = true;
    loadMessages(conversationId, userId)
      .then((thread) => { if (active) setMessages(thread); })
      .catch((cause: unknown) => console.warn("[chat] Could not refresh active conversation messages", cause));
    return () => { active = false; };
  }, [conversationId, loading, storeVersion, userId]);

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
  const directAvatarUrl = conversation?.kind === "direct"
    ? getImagePublicUrl("profile-images", conversation.avatarPath)
    : null;
  const searchValue = searchQuery.trim().toLocaleLowerCase();
  const visibleMessages = searchValue
    ? messages.filter((message) => message.body.toLocaleLowerCase().includes(searchValue))
    : messages;

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

  function scrollToMessage(messageId: string) {
    const offset = messageOffsetsRef.current[messageId];
    if (offset !== undefined) messagesRef.current?.scrollTo({ y: Math.max(0, offset - 30), animated: true });
  }

  function openMessageAttachment(message: MessageData) {
    if (!message.attachmentPath || !conversation) return;
    router.push({ pathname: "/chat-attachment/[id]", params: { id: message.id, conversationId: conversation.id } });
  }

  async function chooseMessageMedia() {
    if (sending) return;
    setSendError("");
    setAttachmentPickerOpen(false);
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images", "videos"],
        allowsEditing: false,
        quality: 0.8,
        preferredAssetRepresentationMode: ImagePicker.UIImagePickerPreferredAssetRepresentationMode.Compatible,
      });
      if (result.canceled) return;
      const asset = result.assets[0];
      if (!asset) throw new Error("No media was selected.");
      if (asset.fileSize != null && asset.fileSize > MAX_MESSAGE_ATTACHMENT_SIZE_BYTES) {
        throw new Error("Choose an attachment smaller than 20 MB.");
      }
      setAttachmentAsset({
        uri: asset.uri,
        mimeType: asset.mimeType,
        fileName: asset.fileName ?? (asset.type === "video" ? "Video" : "Image"),
        fileSize: asset.fileSize,
      });
    } catch (cause) {
      setSendError(cause instanceof Error ? cause.message : "Could not select media.");
    }
  }

  async function chooseMessageFile() {
    if (sending) return;
    setSendError("");
    setAttachmentPickerOpen(false);
    try {
      const result = await DocumentPicker.getDocumentAsync({ type: "*/*", copyToCacheDirectory: true });
      if (result.canceled) return;
      const asset = result.assets[0];
      if (!asset) throw new Error("No file was selected.");
      if (asset.size != null && asset.size > MAX_MESSAGE_ATTACHMENT_SIZE_BYTES) {
        throw new Error("Choose an attachment smaller than 20 MB.");
      }
      setAttachmentAsset({ uri: asset.uri, mimeType: asset.mimeType, fileName: asset.name, fileSize: asset.size });
    } catch (cause) {
      setSendError(cause instanceof Error ? cause.message : "Could not select this file.");
    }
  }

  function startReply(message: MessageData) {
    setReplyTarget(message);
    setSelectedMessage(null);
    setReplyChainTarget(null);
  }

  function forwardSelectedMessage() {
    if (!selectedMessage || !conversation) return;
    const message = selectedMessage;
    setSelectedMessage(null);
    router.push({
      pathname: "/share",
      params: { sourceConversationId: conversation.id, messageId: message.id },
    });
  }

  async function setMute(durationMinutes: number | "forever" | null) {
    if (!conversation || !userId) return;
    setMuteOptionsOpen(false);
    setChatActionError("");
    const mutedForever = durationMinutes === "forever";
    const mutedUntil = typeof durationMinutes === "number"
      ? new Date(Date.now() + durationMinutes * 60_000).toISOString()
      : null;
    try {
      await updateConversationPreferences(userId, conversation.id, {
        updateMute: true,
        mutedUntil,
        mutedForever,
      });
      setConversation({ ...conversation, mutedUntil, mutedForever });
    } catch (cause) {
      setChatActionError(cause instanceof Error ? cause.message : "Could not update chat mute settings.");
    }
  }

  async function setChatBackground(background: ChatBackground) {
    if (!conversation || !userId) return;
    setBackgroundOptionsOpen(false);
    setChatActionError("");
    try {
      await updateConversationPreferences(userId, conversation.id, { background });
      setConversation({ ...conversation, background });
    } catch (cause) {
      setChatActionError(cause instanceof Error ? cause.message : "Could not change the chat background.");
    }
  }

  async function clearChat() {
    if (!conversation || !userId) return;
    setChatActionError("");
    try {
      await clearConversationMessages(userId, conversation.id);
      setMessages([]);
      messageOffsetsRef.current = {};
      setReplyTarget(null);
      setConversation({ ...conversation, lastMessage: "No messages yet", clearedAt: new Date().toISOString() });
    } catch (cause) {
      setChatActionError(cause instanceof Error ? cause.message : "Could not clear this chat.");
    }
  }

  function confirmClearChat() {
    setChatMenuOpen(false);
    Alert.alert("Clear chat?", "This clears messages from your chat view. It does not delete messages for other members.", [
      { text: "Cancel", style: "cancel" },
      { text: "Clear chat", style: "destructive", onPress: () => { void clearChat(); } },
    ]);
  }

  async function deleteChatForMe() {
    if (!conversation || !userId) return;
    setChatMenuOpen(false);
    setChatActionError("");
    try {
      await updateConversationPreferences(userId, conversation.id, { deleteChat: true, clearChat: true });
      router.replace("/(tabs)/messages");
    } catch (cause) {
      setChatActionError(cause instanceof Error ? cause.message : "Could not delete this chat for you.");
    }
  }

  function confirmDeleteChat() {
    if (!conversation) return;
    Alert.alert("Delete this chat?", "It will be removed only from your chat list. The conversation and messages remain for everyone else.", [
      { text: "Cancel", style: "cancel" },
      { text: "Delete for me", style: "destructive", onPress: () => { void deleteChatForMe(); } },
    ]);
  }

  async function leaveGroup(deleteChat: boolean) {
    if (!conversation || !userId) return;
    setChatMenuOpen(false);
    setChatActionError("");
    try {
      await leaveGroupConversation(userId, conversation.id, deleteChat);
      router.replace("/(tabs)/messages");
    } catch (cause) {
      setChatActionError(cause instanceof Error ? cause.message : "Could not leave this group.");
    }
  }

  function confirmLeaveGroup() {
    if (!conversation) return;
    Alert.alert("Leave group?", "You will no longer receive messages in this group.", [
      { text: "Cancel", style: "cancel" },
      { text: "Leave group", style: "destructive", onPress: () => { void leaveGroup(false); } },
      { text: "Leave and delete chat", style: "destructive", onPress: () => { void leaveGroup(true); } },
    ]);
  }

  function openSearch() {
    setChatMenuOpen(false);
    setSearchQuery("");
    setSearchOpen(true);
    requestAnimationFrame(() => searchInputRef.current?.focus());
  }

  function openMemberManager(mode: "add-user" | "create-group") {
    if (!conversation) return;
    setChatMenuOpen(false);
    router.push({ pathname: "/chat-members/[id]", params: { id: conversation.id, mode } });
  }

  async function submitMessage() {
    const body = draft.trim();
    if (!conversation || !userId || (!body && !attachmentAsset) || body.length > 5000 || sending) return;
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = null;
    publishTypingPresence(false);
    setSending(true);
    setSendError("");
    setDraft("");
    try {
      const attachmentPath = attachmentAsset
        ? await uploadMessageMedia(userId, conversation.id, attachmentAsset)
        : null;
      const message = await sendMessage(conversation.id, userId, body, {
        replyToMessageId: replyTarget?.id ?? null,
        attachmentPath,
        attachmentName: attachmentAsset?.fileName ?? null,
        attachmentMimeType: attachmentAsset?.mimeType ?? null,
      });
      setMessages((current) => current.some((item) => item.id === message.id) ? current : [...current, message]);
      setReplyTarget(null);
      setAttachmentAsset(null);
    } catch (cause) {
      handleDraftChange(body);
      setSendError(cause instanceof Error ? cause.message : "Could not send your message.");
    } finally {
      setSending(false);
    }
  }

  return <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === "ios" ? "padding" : Platform.OS === "android" ? "height" : undefined}>
    {searchOpen
      ? <View style={styles.header}><View style={styles.chatSearchBar}><Search color={colors.muted} size={17} /><TextInput ref={searchInputRef} autoFocus value={searchQuery} onChangeText={setSearchQuery} placeholder="Search messages" placeholderTextColor={colors.subtle} returnKeyType="search" style={styles.chatSearchInput} /><Pressable accessibilityRole="button" accessibilityLabel="Close message search" onPress={() => { setSearchOpen(false); setSearchQuery(""); Keyboard.dismiss(); }}><X color={colors.muted} size={19} /></Pressable></View></View>
      : <View style={styles.header}><Pressable accessibilityRole="button" accessibilityLabel="Back to messages" style={styles.back} onPress={() => router.back()}><ArrowLeft color={colors.ink} size={19} /></Pressable><View style={styles.headerDetails}><Pressable accessibilityRole="button" accessibilityLabel={`View ${title}'s profile picture`} disabled={!directAvatarUrl} onPress={() => setAvatarPreviewOpen(true)}><Avatar initials={initials || "?"} imageUrl={directAvatarUrl} color={colors.leaf} size={38} /></Pressable><Pressable accessibilityRole="button" accessibilityLabel={`Open details for ${title}`} disabled={!conversation} onPress={() => conversation && router.push({ pathname: "/chat-details/[id]", params: { id: conversation.id } })} style={styles.headerText}><Text numberOfLines={1} style={styles.name}>{title}</Text></Pressable></View><Pressable accessibilityRole="button" accessibilityLabel="Chat options" onPress={() => setChatMenuOpen(true)} style={styles.more}><MoreHorizontal color={colors.muted} size={20} /></Pressable></View>}
    <ImagePreviewModal imageUrl={directAvatarUrl} visible={avatarPreviewOpen} label={title} onClose={() => setAvatarPreviewOpen(false)} />
    {!!chatActionError && <Text accessibilityRole="alert" style={styles.chatActionError}>{chatActionError}</Text>}
    <ScrollView ref={messagesRef} style={[styles.messages, { backgroundColor: CHAT_BACKGROUNDS[conversation?.background ?? "default"].color }]} contentContainerStyle={styles.messageContent} onLayout={() => messagesRef.current?.scrollToEnd({ animated: false })} onContentSizeChange={() => messagesRef.current?.scrollToEnd({ animated: false })} keyboardShouldPersistTaps="handled">
      {loading ? <ActivityIndicator color={colors.leaf} style={styles.loader} /> : error ? <EmptyState icon={MessageCircle} title="Conversation unavailable" description={error} /> : visibleMessages.length ? visibleMessages.map((message) => {
        const mine = message.senderId === userId;
        const senderDisplayName = senderNames[message.senderId] ?? (conversation?.kind === "direct" ? conversation.title : "Rider");
        const senderInitials = senderDisplayName.split(/\s+/).map((part) => part[0]).join("").slice(0, 2).toUpperCase();
        const senderAvatarPath = senderAvatarPaths[message.senderId];
        const senderName = conversation?.kind !== "direct"
          ? mine ? null : senderNames[message.senderId] ?? "Rider"
          : null;
        const repliedTo = messages.find((item) => item.id === message.replyToMessageId);
        const replyChain = message.replyToMessageId ? getReplyChain(message, messages) : [];
        const deliveryStatus = mine ? message.deliveryStatus ?? "sent" : null;
        const attachmentKind = message.attachmentPath
          ? getAttachmentKind(message.attachmentMimeType, message.attachmentName, message.attachmentPath)
          : null;
        return <View key={message.id} onLayout={(event) => { messageOffsetsRef.current[message.id] = event.nativeEvent.layout.y; }} style={[styles.messageRow, mine && styles.myMessageRow]}>
          {conversation?.kind !== "direct" && !mine && <Avatar initials={senderInitials || "R"} imageUrl={getImagePublicUrl("profile-images", senderAvatarPath)} size={30} />}
          <View style={[styles.messageBubbleWrap, replyChain.length > 0 && styles.messageWithReplyChain]}>
            <Pressable onLongPress={() => setSelectedMessage(message)} delayLongPress={300} style={[styles.bubble, mine ? styles.myBubble : styles.otherBubble]}>
              {senderName && <Text style={styles.senderName}>{senderName}</Text>}
              {message.isForwarded && <View style={styles.forwardedIndicator}><Forward color={colors.forest} size={12} /><Text style={styles.forwardedLabel}>Forwarded</Text></View>}
              {message.replyToMessageId && <Pressable accessibilityRole="button" accessibilityLabel={`Go to message replied to by ${senderDisplayName}`} onPress={() => scrollToMessage(message.replyToMessageId!)} style={styles.replyPreview}><Text numberOfLines={1} style={styles.replyPreviewText}><Text style={styles.replyPreviewSender}>{repliedTo ? senderNames[repliedTo.senderId] ?? "Rider" : "Message"}: </Text>{repliedTo ? repliedTo.attachmentPath ? getAttachmentLabel(repliedTo) : repliedTo.body : "Original message unavailable"}</Text></Pressable>}
              {message.attachmentPath && (attachmentKind === "image" && message.attachmentUrl
                ? <Pressable accessibilityRole="imagebutton" accessibilityLabel={`View ${message.attachmentName ?? "shared image"}`} onPress={() => setPreviewImage({ uri: message.attachmentUrl!, label: message.attachmentName ?? "Shared image" })}><Image source={{ uri: message.attachmentUrl }} resizeMode="cover" style={styles.messageImage} /></Pressable>
                : attachmentKind === "video"
                  ? <Pressable accessibilityRole="button" accessibilityLabel="Open video attachment" onPress={() => void openMessageAttachment(message)}><VideoAttachmentThumbnail attachmentPath={message.attachmentPath} style={styles.messageVideo} /></Pressable>
                  : <Pressable accessibilityRole="button" accessibilityLabel={`Open ${message.attachmentName ?? "attachment"}`} onPress={() => void openMessageAttachment(message)} style={styles.attachmentMessageCard}>
                    <View style={styles.attachmentMessageIcon}>{attachmentKind === "audio"
                      ? <Music2 color={colors.forest} size={19} />
                      : attachmentKind === "image" ? <ImagePlus color={colors.forest} size={19} /> : <FileText color={colors.forest} size={19} />}</View>
                    <View style={styles.attachmentMessageCopy}><Text numberOfLines={1} style={styles.attachmentMessageName}>{message.attachmentName ?? "Attachment"}</Text><Text style={styles.attachmentMessageType}>{message.attachmentMimeType ?? "Tap to open"}</Text></View>
                  </Pressable>)}
              {message.body && (!message.attachmentPath || (message.body !== "Photo" && message.body !== "Attachment")) && <Text style={[styles.message, message.attachmentPath && styles.attachmentMessage]}>{message.body}</Text>}
              <Text style={styles.messageTime}>{new Date(message.createdAt).toLocaleString(undefined, { hour: "numeric", minute: "2-digit" })}</Text>
              {deliveryStatus && <Text style={styles.deliveryStatus}>{deliveryStatus[0].toUpperCase() + deliveryStatus.slice(1)}</Text>}
            </Pressable>
            {replyChain.length > 0 && <Pressable accessibilityRole="button" accessibilityLabel={`View ${replyChain.length} earlier messages in this reply chain`} onPress={() => setReplyChainTarget(message)} style={styles.replyChainButton}><ChevronsUp color={colors.forest} size={15} /><Text style={styles.replyChainCount}>{replyChain.length}</Text></Pressable>}
          </View>
        </View>;
      }) : searchValue ? <EmptyState icon={Search} title="No messages found" description="Try another search." /> : <EmptyState icon={MessageCircle} title="No messages yet" description="Messages for this conversation will appear here." />}
    </ScrollView>
    {typingUsers.length > 0 && <Text accessibilityLiveRegion="polite" style={styles.typingIndicator}>{conversation?.kind === "direct"
      ? "Typing..."
      : `${typingUsers.map((person) => person.displayName).join(", ")} ${typingUsers.length === 1 ? "is" : "are"} typing...`}</Text>}
    {!!conversation && !error && !loading && <View style={[styles.composer, { paddingBottom: keyboardVisible ? 10 + COMPOSER_FIELD_MIN_HEIGHT * 0.6 : Math.max(10, insets.bottom) }]}>
      {replyTarget && <View style={styles.composerReply}><View style={styles.composerReplyCopy}><Text style={styles.composerReplyTitle}>Replying to {senderNames[replyTarget.senderId] ?? "Rider"}</Text><Text numberOfLines={1} style={styles.composerReplyText}>{replyTarget.attachmentPath ? getAttachmentLabel(replyTarget) : replyTarget.body}</Text></View><Pressable accessibilityRole="button" accessibilityLabel="Cancel reply" onPress={() => setReplyTarget(null)}><X color={colors.muted} size={18} /></Pressable></View>}
      {attachmentAsset && <View style={styles.attachmentPreview}>
        {getAttachmentKind(attachmentAsset.mimeType, attachmentAsset.fileName) === "image"
          ? <Image source={{ uri: attachmentAsset.uri }} resizeMode="cover" style={styles.attachmentThumbnail} />
          : <View style={styles.attachmentFileIcon}>{getAttachmentKind(attachmentAsset.mimeType, attachmentAsset.fileName) === "video"
            ? <Film color={colors.forest} size={18} />
            : getAttachmentKind(attachmentAsset.mimeType, attachmentAsset.fileName) === "audio"
              ? <Music2 color={colors.forest} size={18} />
              : <FileText color={colors.forest} size={18} />}</View>}
        <View style={styles.attachmentPreviewCopy}><Text numberOfLines={1} style={styles.attachmentLabel}>{attachmentAsset.fileName ?? "Attachment selected"}</Text><Text style={styles.attachmentSize}>{formatAttachmentSize(attachmentAsset.fileSize) ?? "Ready to send"}</Text></View>
        <Pressable accessibilityRole="button" accessibilityLabel="Remove attachment" onPress={() => setAttachmentAsset(null)}><X color={colors.muted} size={18} /></Pressable>
      </View>}
      <View style={styles.composerRow}><Pressable accessibilityRole="button" accessibilityLabel="Attach a file" disabled={sending} onPress={() => setAttachmentPickerOpen(true)} style={styles.attachButton}><Paperclip color={colors.forest} size={20} /></Pressable><View style={styles.composerField}><TextInput value={draft} onChangeText={handleDraftChange} placeholder="Write a message" placeholderTextColor={colors.subtle} multiline maxLength={5000} editable={!sending} style={styles.composerInput} /></View><Pressable accessibilityLabel="Send message" accessibilityState={{ disabled: (!draft.trim() && !attachmentAsset) || sending }} disabled={(!draft.trim() && !attachmentAsset) || sending} onPress={() => void submitMessage()} style={[styles.sendButton, ((!draft.trim() && !attachmentAsset) || sending) && styles.sendButtonDisabled]}>{sending ? <ActivityIndicator size="small" color={colors.surface} /> : <Send color={colors.surface} size={16} />}</Pressable></View>
      {!!sendError && <Text accessibilityRole="alert" style={styles.sendError}>{sendError}</Text>}
    </View>}
    <ImagePreviewModal imageUrl={previewImage?.uri ?? null} visible={!!previewImage} label={previewImage?.label ?? "Shared photo"} onClose={() => setPreviewImage(null)} />
    <Modal transparent visible={attachmentPickerOpen} animationType="fade" onRequestClose={() => setAttachmentPickerOpen(false)}>
      <Pressable style={styles.modalBackdrop} onPress={() => setAttachmentPickerOpen(false)}>
        <View style={styles.messageMenu}>
          <Pressable accessibilityRole="button" onPress={() => void chooseMessageMedia()} style={styles.menuAction}><ImagePlus color={colors.forest} size={17} /><Text style={styles.menuActionText}>Photo or video</Text></Pressable>
          <Pressable accessibilityRole="button" onPress={() => void chooseMessageFile()} style={styles.menuAction}><FileText color={colors.forest} size={17} /><Text style={styles.menuActionText}>Browse files</Text></Pressable>
        </View>
      </Pressable>
    </Modal>
    <Modal transparent visible={!!selectedMessage} animationType="fade" onRequestClose={() => setSelectedMessage(null)}>
      <Pressable style={styles.modalBackdrop} onPress={() => setSelectedMessage(null)}>
        <View style={styles.messageMenu}>
          <Pressable accessibilityRole="button" onPress={forwardSelectedMessage} style={styles.menuAction}><Forward color={colors.forest} size={17} /><Text style={styles.menuActionText}>Forward</Text></Pressable>
          <Pressable accessibilityRole="button" onPress={() => selectedMessage && startReply(selectedMessage)} style={styles.menuAction}><Reply color={colors.forest} size={17} /><Text style={styles.menuActionText}>Reply</Text></Pressable>
        </View>
      </Pressable>
    </Modal>
    <Modal transparent visible={!!replyChainTarget} animationType="fade" onRequestClose={() => setReplyChainTarget(null)}>
      <View style={styles.modalBackdrop}>
        <View style={styles.replyChainPanel}>
          <View style={styles.replyChainHeader}><Text style={styles.replyChainHeading}>Earlier messages in this thread</Text><Pressable accessibilityRole="button" accessibilityLabel="Close reply chain" onPress={() => setReplyChainTarget(null)}><X color={colors.muted} size={19} /></Pressable></View>
          <ScrollView style={styles.replyChainList}>
            {replyChainTarget && getReplyChain(replyChainTarget, messages).map((item) => <Pressable key={item.id} accessibilityRole="button" onPress={() => { setReplyChainTarget(null); requestAnimationFrame(() => scrollToMessage(item.id)); }} style={styles.replyChainItem}>
              <Text style={styles.replyChainItemSender}>{senderNames[item.senderId] ?? "Rider"}</Text>
              <Text numberOfLines={2} style={styles.replyChainItemBody}>{item.attachmentPath ? getAttachmentLabel(item) : item.body}</Text>
            </Pressable>)}
          </ScrollView>
        </View>
      </View>
    </Modal>
    <Modal transparent visible={chatMenuOpen} animationType="fade" onRequestClose={() => setChatMenuOpen(false)}>
      <Pressable style={[styles.dropdownBackdrop, { paddingTop: insets.top + 66 }]} onPress={() => setChatMenuOpen(false)}>
        <View style={styles.chatMenu}>
          <Pressable accessibilityRole="button" onPress={() => { setChatMenuOpen(false); setBackgroundOptionsOpen(true); }} style={styles.menuAction}><Paintbrush color={colors.forest} size={17} /><Text style={styles.menuActionText}>Change background</Text></Pressable>
          <Pressable accessibilityRole="button" onPress={() => { setChatMenuOpen(false); setMuteOptionsOpen(true); }} style={styles.menuAction}><BellOff color={colors.forest} size={17} /><Text style={styles.menuActionText}>{conversation?.mutedForever || (conversation?.mutedUntil && new Date(conversation.mutedUntil).getTime() > Date.now()) ? "Mute settings" : "Mute chat"}</Text></Pressable>
          <Pressable accessibilityRole="button" onPress={confirmClearChat} style={styles.menuAction}><MessageCircle color={colors.forest} size={17} /><Text style={styles.menuActionText}>Clear chat</Text></Pressable>
          <Pressable accessibilityRole="button" onPress={openSearch} style={styles.menuAction}><Search color={colors.forest} size={17} /><Text style={styles.menuActionText}>Search</Text></Pressable>
          {conversation?.kind === "direct" && <Pressable accessibilityRole="button" onPress={() => openMemberManager("create-group")} style={styles.menuAction}><Users color={colors.forest} size={17} /><Text style={styles.menuActionText}>Add to group</Text></Pressable>}
          {conversation?.kind === "group" && <Pressable accessibilityRole="button" onPress={() => openMemberManager("add-user")} style={styles.menuAction}><UserPlus color={colors.forest} size={17} /><Text style={styles.menuActionText}>Add user</Text></Pressable>}
          {(conversation?.kind === "group" || conversation?.kind === "ride") && <Pressable accessibilityRole="button" onPress={() => { setChatMenuOpen(false); confirmLeaveGroup(); }} style={styles.menuAction}><LogOut color="#9B493C" size={17} /><Text style={[styles.menuActionText, styles.destructiveText]}>Leave group</Text></Pressable>}
          {conversation?.kind === "direct" && <Pressable accessibilityRole="button" onPress={confirmDeleteChat} style={styles.menuAction}><Trash2 color="#9B493C" size={17} /><Text style={[styles.menuActionText, styles.destructiveText]}>Delete chat</Text></Pressable>}
        </View>
      </Pressable>
    </Modal>
    <Modal transparent visible={muteOptionsOpen} animationType="fade" onRequestClose={() => setMuteOptionsOpen(false)}>
      <Pressable style={styles.modalBackdrop} onPress={() => setMuteOptionsOpen(false)}>
        <View style={styles.optionPanel}>
          <View style={styles.optionHeader}><Text style={styles.optionTitle}>Mute chat</Text><Pressable accessibilityRole="button" accessibilityLabel="Close mute options" onPress={() => setMuteOptionsOpen(false)}><X color={colors.muted} size={19} /></Pressable></View>
          {[
            { label: "Unmute", duration: null as number | "forever" | null },
            { label: "5 minutes", duration: 5 as number | "forever" },
            { label: "30 minutes", duration: 30 as number | "forever" },
            { label: "1 hour", duration: 60 as number | "forever" },
            { label: "8 hours", duration: 480 as number | "forever" },
            { label: "24 hours", duration: 1440 as number | "forever" },
            { label: "Forever", duration: "forever" as number | "forever" },
          ].map(({ label, duration }) => <Pressable key={label} accessibilityRole="button" onPress={() => { void setMute(duration); }} style={styles.optionRow}><Text style={styles.optionText}>{label}</Text>{((duration === null && !conversation?.mutedUntil && !conversation?.mutedForever) || (duration === "forever" && conversation?.mutedForever)) && <Text style={styles.selectedOption}>Selected</Text>}</Pressable>)}
        </View>
      </Pressable>
    </Modal>
    <Modal transparent visible={backgroundOptionsOpen} animationType="fade" onRequestClose={() => setBackgroundOptionsOpen(false)}>
      <Pressable style={styles.modalBackdrop} onPress={() => setBackgroundOptionsOpen(false)}>
        <View style={styles.optionPanel}>
          <View style={styles.optionHeader}><Text style={styles.optionTitle}>Chat background</Text><Pressable accessibilityRole="button" accessibilityLabel="Close background options" onPress={() => setBackgroundOptionsOpen(false)}><X color={colors.muted} size={19} /></Pressable></View>
          {(Object.entries(CHAT_BACKGROUNDS) as [ChatBackground, { label: string; color: string }][]).map(([background, option]) => <Pressable key={background} accessibilityRole="button" onPress={() => { void setChatBackground(background); }} style={styles.optionRow}><View style={[styles.backgroundSwatch, { backgroundColor: option.color }]} /><Text style={styles.optionText}>{option.label}</Text>{conversation?.background === background && <Text style={styles.selectedOption}>Selected</Text>}</Pressable>)}
        </View>
      </Pressable>
    </Modal>
  </KeyboardAvoidingView>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.paper },
  header: { minHeight: 66, paddingHorizontal: 14, borderBottomWidth: 1, borderBottomColor: colors.line, backgroundColor: colors.surface, flexDirection: "row", alignItems: "center", gap: 9 },
  chatSearchBar: { flex: 1, minHeight: 40, paddingHorizontal: 10, borderWidth: 1, borderColor: colors.line, borderRadius: 10, backgroundColor: colors.paper, flexDirection: "row", alignItems: "center", gap: 8 },
  chatSearchInput: { flex: 1, minWidth: 0, paddingVertical: 7, color: colors.ink, fontSize: 10 },
  back: { width: 28, height: 38, alignItems: "flex-start", justifyContent: "center" },
  headerDetails: { flex: 1, minWidth: 0, flexDirection: "row", alignItems: "center", gap: 9 },
  headerText: { flex: 1, gap: 3 },
  name: { color: colors.ink, fontSize: 11, fontWeight: "700" },
  more: { width: 30, height: 35, alignItems: "center", justifyContent: "center" },
  messages: { flex: 1 },
  messageContent: { flexGrow: 1, gap: 13, padding: 16, paddingBottom: 24 },
  composer: { paddingHorizontal: 12, paddingTop: 8, paddingBottom: Platform.OS === "ios" ? 20 : 10, borderTopWidth: 1, borderTopColor: colors.line, backgroundColor: colors.surface, gap: 7 },
  composerRow: { flexDirection: "row", alignItems: "flex-end", gap: 8 },
  attachButton: { width: 38, height: 42, alignItems: "center", justifyContent: "center" },
  composerField: { flex: 1, minHeight: COMPOSER_FIELD_MIN_HEIGHT, maxHeight: 120, paddingHorizontal: 11, borderWidth: 1, borderColor: colors.line, borderRadius: 9, backgroundColor: colors.paper, justifyContent: "center" },
  composerInput: { minHeight: 24, maxHeight: 100, paddingVertical: 6, color: colors.ink, fontSize: 10, lineHeight: 15 },
  composerReply: { minHeight: 42, paddingHorizontal: 10, paddingVertical: 7, borderLeftWidth: 3, borderLeftColor: colors.leaf, borderRadius: 8, backgroundColor: colors.paper, flexDirection: "row", alignItems: "center", gap: 8 },
  composerReplyCopy: { flex: 1, gap: 3 },
  composerReplyTitle: { color: colors.forest, fontSize: 8, fontWeight: "800" },
  composerReplyText: { color: colors.muted, fontSize: 8 },
  attachmentPreview: { minHeight: 48, paddingHorizontal: 6, paddingVertical: 4, borderRadius: 8, backgroundColor: colors.paper, flexDirection: "row", alignItems: "center", gap: 8 },
  attachmentThumbnail: { width: 40, height: 40, borderRadius: 6 },
  attachmentFileIcon: { width: 40, height: 40, borderRadius: 6, alignItems: "center", justifyContent: "center", backgroundColor: colors.paleGreen },
  attachmentPreviewCopy: { flex: 1, gap: 3 },
  attachmentLabel: { color: colors.muted, fontSize: 8, fontWeight: "700" },
  attachmentSize: { color: colors.subtle, fontSize: 7 },
  sendButton: { width: 42, height: 42, borderRadius: 11, alignItems: "center", justifyContent: "center", backgroundColor: colors.forest },
  sendButtonDisabled: { opacity: 0.5 },
  sendError: { width: "100%", color: "#9B493C", fontSize: 8, lineHeight: 12 },
  loader: { marginVertical: 28 },
  messageRow: { width: "100%", flexDirection: "row", alignItems: "flex-end", gap: 7 },
  myMessageRow: { justifyContent: "flex-end" },
  messageBubbleWrap: { position: "relative", maxWidth: "82%" },
  messageWithReplyChain: { marginBottom: 9 },
  bubble: { maxWidth: "100%", padding: 11, borderWidth: 1, borderColor: colors.line, borderTopLeftRadius: 4, borderTopRightRadius: 13, borderBottomRightRadius: 13, borderBottomLeftRadius: 13 },
  otherBubble: { alignSelf: "flex-start", backgroundColor: colors.surface },
  myBubble: { alignSelf: "flex-end", borderColor: "#DFE8D6", borderTopLeftRadius: 13, borderTopRightRadius: 4, backgroundColor: "#EAF0DF" },
  message: { color: "#40554A", fontSize: 10, lineHeight: 15 },
  attachmentMessage: { marginTop: 8 },
  messageImage: { width: 190, height: 140, marginTop: 4, borderRadius: 8, backgroundColor: "#E9EFE1" },
  messageVideo: { width: 190, height: 140, marginTop: 4, borderRadius: 8, backgroundColor: "#E9EFE1" },
  attachmentMessageCard: { minWidth: 190, maxWidth: 240, marginTop: 4, padding: 8, borderRadius: 8, backgroundColor: "#FFFFFF99", flexDirection: "row", alignItems: "center", gap: 9 },
  attachmentMessageIcon: { width: 34, height: 34, borderRadius: 8, alignItems: "center", justifyContent: "center", backgroundColor: colors.surface },
  attachmentMessageCopy: { flex: 1, gap: 3 },
  attachmentMessageName: { color: colors.ink, fontSize: 8, fontWeight: "800" },
  attachmentMessageType: { color: colors.muted, fontSize: 7 },
  replyPreview: { marginBottom: 7, paddingHorizontal: 7, paddingVertical: 5, borderLeftWidth: 2, borderLeftColor: colors.leaf, borderRadius: 5, backgroundColor: "#FFFFFF99" },
  replyPreviewText: { color: colors.muted, fontSize: 8 },
  replyPreviewSender: { color: colors.forest, fontWeight: "800" },
  forwardedIndicator: { marginBottom: 5, flexDirection: "row", alignItems: "center", gap: 5 },
  forwardedLabel: { color: colors.forest, fontSize: 8, fontWeight: "800" },
  senderName: { marginBottom: 4, color: colors.forest, fontSize: 8, fontWeight: "800" },
  messageTime: { marginTop: 6, color: colors.subtle, fontSize: 7, textAlign: "right" },
  deliveryStatus: { marginTop: 2, color: colors.subtle, fontSize: 7, fontWeight: "700", textAlign: "right" },
  replyChainButton: { position: "absolute", left: 7, bottom: -5, minWidth: 30, minHeight: 23, paddingHorizontal: 4, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 1, borderWidth: 1, borderColor: colors.line, borderRadius: 12, backgroundColor: colors.surface, elevation: 2 },
  replyChainCount: { color: colors.forest, fontSize: 7, fontWeight: "800" },
  modalBackdrop: { flex: 1, padding: 20, alignItems: "center", justifyContent: "center", backgroundColor: "#13251F66" },
  dropdownBackdrop: { flex: 1, paddingHorizontal: 12, alignItems: "flex-end", backgroundColor: "#13251F33" },
  chatActionError: { paddingHorizontal: 15, paddingVertical: 6, color: "#9B493C", fontSize: 8 },
  messageMenu: { width: 220, padding: 6, borderRadius: 13, backgroundColor: colors.surface },
  chatMenu: { width: 245, maxWidth: "100%", padding: 6, borderRadius: 13, backgroundColor: colors.surface },
  menuAction: { minHeight: 46, paddingHorizontal: 12, flexDirection: "row", alignItems: "center", gap: 10 },
  menuActionText: { color: colors.ink, fontSize: 11, fontWeight: "700" },
  destructiveText: { color: "#9B493C" },
  optionPanel: { width: 280, maxWidth: "100%", maxHeight: "78%", padding: 15, borderRadius: 14, backgroundColor: colors.surface },
  optionHeader: { paddingBottom: 10, borderBottomWidth: 1, borderBottomColor: colors.line, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  optionTitle: { color: colors.ink, fontSize: 12, fontWeight: "800" },
  optionRow: { minHeight: 42, borderBottomWidth: 1, borderBottomColor: colors.line, flexDirection: "row", alignItems: "center", gap: 9 },
  optionText: { flex: 1, color: colors.ink, fontSize: 10, fontWeight: "600" },
  selectedOption: { color: colors.forest, fontSize: 8, fontWeight: "800" },
  backgroundSwatch: { width: 24, height: 24, borderWidth: 1, borderColor: colors.line, borderRadius: 12 },
  replyChainPanel: { width: "100%", maxHeight: "70%", padding: 15, borderRadius: 14, backgroundColor: colors.surface },
  replyChainHeader: { paddingBottom: 10, borderBottomWidth: 1, borderBottomColor: colors.line, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
  replyChainHeading: { color: colors.ink, fontSize: 12, fontWeight: "800" },
  replyChainList: { marginTop: 4 },
  replyChainItem: { paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.line, gap: 4 },
  replyChainItemSender: { color: colors.forest, fontSize: 8, fontWeight: "800" },
  replyChainItemBody: { color: colors.muted, fontSize: 9, lineHeight: 14 },
  typingIndicator: { paddingHorizontal: 16, paddingVertical: 7, color: colors.muted, fontSize: 8, fontStyle: "italic" },
});