import { useCallback, useMemo, useState } from "react";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { ArrowLeft, Check, UserPlus, Users } from "lucide-react-native";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Avatar } from "../../components/avatar";
import { EmptyState } from "../../components/empty-state";
import { colors } from "../../components/theme";
import { useAuth } from "../../components/auth-provider";
import {
  addGroupConversationMembers,
  ConversationData,
  ConversationParticipantData,
  createDirectConversation,
  createGroupConversation,
  FriendData,
  getImagePublicUrl,
  loadConversationParticipants,
  loadConversations,
  loadFriendRequests,
} from "../../lib/app-data";

export default function ChatMembersScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { id: routeId, mode: routeMode } = useLocalSearchParams<{ id: string; mode: "add-user" | "create-group" | "new-chat" }>();
  const mode = routeMode === "create-group" ? "create-group" : routeMode === "new-chat" ? "new-chat" : "add-user";
  const conversationId = mode === "new-chat" ? null : typeof routeId === "string" ? routeId : null;
  const { ready, userId } = useAuth();
  const [conversation, setConversation] = useState<ConversationData | null>(null);
  const [participants, setParticipants] = useState<ConversationParticipantData[]>([]);
  const [friends, setFriends] = useState<FriendData[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [groupName, setGroupName] = useState("Group chat");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useFocusEffect(useCallback(() => {
    if (!ready || !userId || (mode !== "new-chat" && !conversationId)) return;
    let active = true;
    setLoading(true);
    setError("");
    async function loadMembers() {
      const requests = await loadFriendRequests(userId, true);
      if (mode === "new-chat") {
        if (active) {
          setConversation(null);
          setParticipants([]);
          setFriends(requests.filter((friend) => friend.status === "accepted"));
        }
        return;
      }
      const [conversations, people] = await Promise.all([
        loadConversations(userId, true),
        loadConversationParticipants(conversationId!, userId, true),
      ]);
      if (!active) return;
      const current = conversations.find((item) => item.id === conversationId) ?? null;
      if (!current) throw new Error("This conversation is unavailable.");
      if (mode === "add-user" && current.kind !== "group") throw new Error("Only custom group chats can add members.");
      if (mode === "create-group" && current.kind !== "direct") throw new Error("Only direct chats can be turned into a new group.");
      setConversation(current);
      setParticipants(people);
      setFriends(requests.filter((friend) => friend.status === "accepted"));
    }
    void loadMembers().catch((cause: unknown) => {
      if (active) setError(cause instanceof Error ? cause.message : "Could not load chat members.");
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => { active = false; };
  }, [ready, userId, conversationId, mode]));

  const availableFriends = useMemo(() => {
    const currentMemberIds = new Set(participants.map((participant) => participant.userId));
    const query = search.trim().toLocaleLowerCase();
    return friends.filter((friend) =>
      !currentMemberIds.has(friend.otherUserId)
      && (!query || friend.name.toLocaleLowerCase().includes(query)));
  }, [friends, participants, search]);

  function toggleFriend(userIdToToggle: string) {
    setSelectedIds((ids) => ids.includes(userIdToToggle)
      ? ids.filter((id) => id !== userIdToToggle)
      : [...ids, userIdToToggle]);
  }

  async function submit() {
    if (!userId || selectedIds.length === 0 || saving) return;
    if (mode !== "new-chat" && (!conversation || !conversationId)) return;
    setSaving(true);
    setError("");
    try {
      if (mode === "new-chat" && selectedIds.length === 1) {
        const selectedFriend = friends.find((friend) => friend.otherUserId === selectedIds[0]);
        if (!selectedFriend) throw new Error("Choose an accepted friend to start a chat.");
        const directId = await createDirectConversation(selectedFriend.otherUserId, userId);
        router.replace({ pathname: "/chat/[id]", params: { id: directId, title: selectedFriend.name } });
      } else if (mode === "new-chat") {
        if (groupName.trim().length === 0) throw new Error("Enter a name for the group chat.");
        const createdId = await createGroupConversation(selectedIds, groupName.trim(), userId);
        router.replace({ pathname: "/chat/[id]", params: { id: createdId } });
      } else if (mode === "create-group") {
        const existingMembers = participants
          .filter((participant) => participant.userId !== userId)
          .map((participant) => participant.userId);
        const createdId = await createGroupConversation(
          [...new Set([...existingMembers, ...selectedIds])],
          groupName.trim(),
          userId,
        );
        router.replace({ pathname: "/chat/[id]", params: { id: createdId } });
      } else {
        await addGroupConversationMembers(conversationId!, selectedIds, userId);
        router.replace({ pathname: "/chat/[id]", params: { id: conversationId } });
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : mode === "new-chat" ? "Could not create this chat." : "Could not update group members.");
    } finally {
      setSaving(false);
    }
  }

  const title = mode === "create-group" ? "Create a group chat" : mode === "new-chat" ? "New chat" : "Add people";
  const showGroupName = mode === "create-group" || (mode === "new-chat" && selectedIds.length > 1);
  const canSubmit = selectedIds.length > 0
    && (!showGroupName || groupName.trim().length > 0)
    && !saving;

  return <View style={styles.screen}>
    <View style={[styles.header, { paddingTop: Math.max(8, insets.top + 6) }]}>
      <Pressable accessibilityRole="button" accessibilityLabel="Back to chat" onPress={() => router.back()} style={styles.back}><ArrowLeft color={colors.ink} size={19} /></Pressable>
      <View style={styles.headerCopy}><Text style={styles.title}>{title}</Text><Text style={styles.subtitle}>{conversation?.title ?? "Choose accepted friends"}</Text></View>
    </View>
    {showGroupName && <View style={styles.groupNameField}><Text style={styles.fieldLabel}>Group name</Text><TextInput value={groupName} onChangeText={setGroupName} maxLength={80} placeholder="Name this group" placeholderTextColor={colors.subtle} style={styles.groupNameInput} /></View>}
    <View style={styles.searchBar}><UserPlus color={colors.muted} size={16} /><TextInput value={search} onChangeText={setSearch} placeholder="Search friends" placeholderTextColor={colors.subtle} style={styles.searchInput} /></View>
    {!!error && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
    {loading ? <ActivityIndicator color={colors.leaf} style={styles.loader} /> : (mode !== "new-chat" && !conversation) || error
      ? <EmptyState icon={Users} title="Members unavailable" description={error || "This chat is unavailable."} />
      : availableFriends.length
        ? <ScrollView contentContainerStyle={styles.list}>
          {availableFriends.map((friend) => {
            const selected = selectedIds.includes(friend.otherUserId);
            return <Pressable key={friend.otherUserId} accessibilityRole="checkbox" accessibilityState={{ checked: selected }} onPress={() => toggleFriend(friend.otherUserId)} style={styles.friendRow}>
              <Avatar initials={friend.name.split(/\s+/).map((part) => part[0]).join("").slice(0, 2).toUpperCase()} imageUrl={getImagePublicUrl("profile-images", friend.avatarPath)} color={colors.leaf} size={40} />
              <Text numberOfLines={1} style={styles.friendName}>{friend.name}</Text>
              <View style={[styles.checkbox, selected && styles.checkboxSelected]}>{selected && <Check color={colors.surface} size={14} />}</View>
            </Pressable>;
          })}
        </ScrollView>
        : <EmptyState icon={Users} title={search ? "No matching friends" : "No friends to add"} description={search ? "Try another name." : mode === "new-chat" ? "Only accepted friends can start a direct chat or group with you." : "Only accepted friends who are not already in this chat can be added."} />}
    {!loading && (mode === "new-chat" || !!conversation) && !error && <Pressable accessibilityRole="button" accessibilityState={{ disabled: !canSubmit }} disabled={!canSubmit} onPress={() => void submit()} style={[styles.submitButton, !canSubmit && styles.disabled]}>
      {saving ? <ActivityIndicator size="small" color={colors.surface} /> : <Check color={colors.surface} size={17} />}
      <Text style={styles.submitText}>{mode === "new-chat" ? selectedIds.length === 1 ? "Start chat" : "Create group" : mode === "create-group" ? "Create group" : `Add ${selectedIds.length || ""} ${selectedIds.length === 1 ? "person" : "people"}`}</Text>
    </Pressable>}
  </View>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.paper },
  header: { minHeight: 72, paddingHorizontal: 15, paddingBottom: 10, flexDirection: "row", alignItems: "center", gap: 11 },
  back: { width: 36, height: 38, alignItems: "center", justifyContent: "center", borderRadius: 10, backgroundColor: colors.surface },
  headerCopy: { flex: 1, gap: 3 },
  title: { color: colors.ink, fontSize: 15, fontWeight: "800" },
  subtitle: { color: colors.muted, fontSize: 9 },
  groupNameField: { marginHorizontal: 16, marginTop: 6, paddingHorizontal: 12, paddingVertical: 8, borderWidth: 1, borderColor: colors.line, borderRadius: 11, backgroundColor: colors.surface, gap: 4 },
  fieldLabel: { color: colors.forest, fontSize: 8, fontWeight: "800" },
  groupNameInput: { paddingVertical: 5, color: colors.ink, fontSize: 10 },
  searchBar: { minHeight: 42, marginHorizontal: 16, marginTop: 10, marginBottom: 8, paddingHorizontal: 11, borderWidth: 1, borderColor: colors.line, borderRadius: 11, backgroundColor: colors.surface, flexDirection: "row", alignItems: "center", gap: 8 },
  searchInput: { flex: 1, paddingVertical: 7, color: colors.ink, fontSize: 10 },
  error: { marginHorizontal: 16, marginVertical: 5, color: "#9B493C", fontSize: 9 },
  loader: { marginTop: 24 },
  list: { paddingHorizontal: 16, paddingBottom: 20 },
  friendRow: { minHeight: 62, paddingHorizontal: 8, borderBottomWidth: 1, borderBottomColor: colors.line, flexDirection: "row", alignItems: "center", gap: 10 },
  friendName: { flex: 1, color: colors.ink, fontSize: 10, fontWeight: "700" },
  checkbox: { width: 22, height: 22, borderWidth: 1, borderColor: colors.line, borderRadius: 7, alignItems: "center", justifyContent: "center" },
  checkboxSelected: { borderColor: colors.forest, backgroundColor: colors.forest },
  submitButton: { minHeight: 46, marginHorizontal: 16, marginTop: 8, marginBottom: 16, borderRadius: 11, backgroundColor: colors.forest, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 },
  disabled: { opacity: 0.45 },
  submitText: { color: colors.surface, fontSize: 10, fontWeight: "800" },
});
