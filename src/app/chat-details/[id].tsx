import { useCallback, useState } from "react";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { ArrowLeft, ArrowRight, Bike, CalendarDays, MessageCircle, Users } from "lucide-react-native";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useAuth } from "../../components/auth-provider";
import { useStoreVersion } from "../../lib/store-events";
import { Avatar } from "../../components/avatar";
import { EmptyState } from "../../components/empty-state";
import { colors } from "../../components/theme";
import { ConversationData, ConversationParticipantData, createDirectConversation, loadConversationParticipants, loadConversations, loadFriendRequests, loadSharedActiveRides, SharedRideData } from "../../lib/app-data";

export default function ChatDetailsScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { ready, userId } = useAuth();
  const [conversation, setConversation] = useState<ConversationData | null>(null);
  const [participants, setParticipants] = useState<ConversationParticipantData[]>([]);
  const [sharedRides, setSharedRides] = useState<SharedRideData[]>([]);
  const [acceptedFriendIds, setAcceptedFriendIds] = useState<string[]>([]);
  const [directConversations, setDirectConversations] = useState<ConversationData[]>([]);
  const [chattingUserId, setChattingUserId] = useState("");
  const [actionError, setActionError] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const storeVersion = useStoreVersion();

  useFocusEffect(useCallback(() => {
    if (!ready || !userId || !id || Array.isArray(id)) return;
    const viewerId = userId;
    let active = true;
    setError("");
    async function load() {
      try {
        const [rows, friendships] = await Promise.all([loadConversations(viewerId), loadFriendRequests(viewerId)]);
        const selected = rows.find((row) => row.id === id);
        if (!selected) throw new Error("This conversation isn’t available to your account.");
        const [members, rides] = await Promise.all([
          loadConversationParticipants(id, viewerId),
          selected.kind === "direct" && selected.otherUserId ? loadSharedActiveRides(selected.otherUserId, viewerId) : Promise.resolve([] as SharedRideData[]),
        ]);
        if (!active) return;
        setConversation(selected);
        setParticipants(members);
        setSharedRides(rides);
        setDirectConversations(rows.filter((row) => row.kind === "direct"));
        setAcceptedFriendIds(friendships.filter((friend) => friend.status === "accepted").map((friend) => friend.otherUserId));
      } catch (cause) {
        if (active) setError(cause instanceof Error ? cause.message : "Could not load chat details.");
      } finally {
        if (active) setLoading(false);
      }
    }
    void load();
    return () => { active = false; };
  }, [ready, userId, id, storeVersion]));

  async function openDirectChat(participant: ConversationParticipantData) {
    if (!userId || chattingUserId || participant.userId === userId) return;
    setChattingUserId(participant.userId);
    setActionError("");
    try {
      const existing = directConversations.find((item) => item.otherUserId === participant.userId);
      const conversationId = existing?.id ?? await createDirectConversation(participant.userId, userId);
      router.push({ pathname: "/chat/[id]", params: { id: conversationId, title: participant.displayName } });
    } catch (cause) {
      setActionError(cause instanceof Error ? cause.message : "Could not open this conversation.");
    } finally {
      setChattingUserId("");
    }
  }

  return <View style={styles.screen}>
    <View style={styles.header}><Pressable accessibilityLabel="Back to chat" onPress={() => router.back()} style={styles.back}><ArrowLeft color={colors.ink} size={19} /></Pressable><Text style={styles.headerTitle}>Chat details</Text><View style={{ flex: 1 }} /></View>
    {loading ? <ActivityIndicator color={colors.leaf} style={styles.loader} /> : error || !conversation ? <EmptyState icon={MessageCircle} title="Chat details unavailable" description={error || "This conversation is unavailable."} /> : <ScrollView contentContainerStyle={styles.content}>
      <View style={styles.titleBlock}><View style={styles.titleIcon}><MessageCircle color={colors.lime} size={17} /></View><Text style={styles.title}>{conversation.title}</Text><Text style={styles.subtitle}>{conversation.detail}</Text></View>
      {conversation.kind === "ride" && conversation.rideId && <Pressable accessibilityRole="button" onPress={() => router.push({ pathname: "/rides/[id]", params: { id: conversation.rideId! } })} style={styles.rideLink}><View style={styles.rideIcon}><Bike color={colors.forest} size={16} /></View><View style={styles.rideCopy}><Text style={styles.rideTitle}>Ride details</Text><Text style={styles.rideSubtitle}>View route, members, and ride status</Text></View><ArrowRight color={colors.muted} size={16} /></Pressable>}
      <View style={styles.sectionHeader}><Users color={colors.leaf} size={16} /><Text style={styles.sectionTitle}>Participants</Text><Text style={styles.count}>{participants.length}</Text></View>
      {conversation.kind === "ride" && !!actionError && <Text accessibilityRole="alert" style={styles.error}>{actionError}</Text>}
      {participants.length ? <View style={styles.peopleList}>{participants.map((person) => {
        const isSelf = person.userId === userId;
        const personContent = <><Avatar initials={person.displayName.split(/\s+/).map((part) => part[0]).join("").slice(0, 2).toUpperCase()} size={36} /><View style={styles.personCopy}><Text style={styles.personName}>{person.displayName}{isSelf ? " · You" : ""}</Text><Text style={styles.personDetail}>{new Date(person.joinedAt).toLocaleDateString()}</Text></View></>;
        return <View key={person.userId} style={styles.personRow}>
          {isSelf ? <View style={styles.personLink}>{personContent}</View> : <Pressable accessibilityRole="button" onPress={() => router.push({ pathname: "/users/[id]", params: { id: person.userId } })} style={styles.personLink}>{personContent}</Pressable>}
          {conversation.kind === "ride" && !isSelf && acceptedFriendIds.includes(person.userId) ? <Pressable accessibilityRole="button" accessibilityLabel={`Chat with ${person.displayName}`} disabled={!!chattingUserId} onPress={() => openDirectChat(person)} style={[styles.chatAction, !!chattingUserId && styles.chatActionBusy]}>{chattingUserId === person.userId ? <ActivityIndicator size="small" color={colors.forest} /> : <MessageCircle color={colors.forest} size={15} />}</Pressable> : !isSelf ? <ArrowRight color={colors.subtle} size={14} /> : null}
        </View>;
      })}</View> : <EmptyState icon={Users} title="No participants" description="Conversation members will appear here." />}
      {conversation.kind === "direct" && <><View style={styles.sectionHeader}><CalendarDays color={colors.leaf} size={16} /><Text style={styles.sectionTitle}>Common active rides</Text><Text style={styles.count}>{sharedRides.length}</Text></View>{sharedRides.length ? <View style={styles.peopleList}>{sharedRides.map((ride) => <Pressable key={ride.id} onPress={() => router.push({ pathname: "/rides/[id]", params: { id: ride.id } })} style={styles.rideRow}><View style={styles.rideCopy}><Text numberOfLines={1} style={styles.rideTitle}>{ride.title}</Text><Text numberOfLines={1} style={styles.rideSubtitle}>{ride.route} · {new Date(ride.startsAt).toLocaleDateString()}</Text></View><ArrowRight color={colors.subtle} size={14} /></Pressable>)}</View> : <EmptyState icon={CalendarDays} title="No common active rides" description="Upcoming rides shared by both riders will appear here." />}</>}
    </ScrollView>}
  </View>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.paper },
  header: { minHeight: 54, paddingHorizontal: 16, flexDirection: "row", alignItems: "center", gap: 9 },
  back: { width: 28, height: 38, justifyContent: "center" },
  headerTitle: { color: colors.ink, fontSize: 12, fontWeight: "800" },
  content: { paddingBottom: 30 },
  loader: { marginTop: 28 },
  titleBlock: { paddingHorizontal: 20, paddingTop: 10, paddingBottom: 18, alignItems: "center" },
  titleIcon: { width: 36, height: 36, borderRadius: 11, alignItems: "center", justifyContent: "center", backgroundColor: colors.forest },
  title: { marginTop: 9, color: colors.ink, fontFamily: "Georgia", fontSize: 22, textAlign: "center" },
  subtitle: { marginTop: 4, color: colors.muted, fontSize: 9 },
  rideLink: { minHeight: 58, marginHorizontal: 16, paddingHorizontal: 11, borderWidth: 1, borderColor: colors.line, borderRadius: 9, backgroundColor: colors.surface, flexDirection: "row", alignItems: "center", gap: 9 },
  rideIcon: { width: 32, height: 32, borderRadius: 9, alignItems: "center", justifyContent: "center", backgroundColor: colors.paleGreen },
  rideCopy: { flex: 1, gap: 4 },
  rideTitle: { color: colors.ink, fontSize: 9, fontWeight: "700" },
  rideSubtitle: { color: colors.muted, fontSize: 7 },
  sectionHeader: { marginHorizontal: 20, marginTop: 19, marginBottom: 8, flexDirection: "row", alignItems: "center", gap: 7 },
  sectionTitle: { flex: 1, color: colors.ink, fontSize: 10, fontWeight: "800" },
  count: { color: colors.muted, fontSize: 8 },
  error: { marginHorizontal: 18, marginTop: 8, color: "#9B493C", fontSize: 8, lineHeight: 12 },
  peopleList: { marginHorizontal: 16, paddingHorizontal: 11, borderWidth: 1, borderColor: colors.line, borderRadius: 10, backgroundColor: colors.surface },
  personRow: { minHeight: 58, borderBottomWidth: 1, borderBottomColor: colors.line, flexDirection: "row", alignItems: "center", gap: 9 },
  personLink: { flex: 1, minHeight: 56, flexDirection: "row", alignItems: "center", gap: 9 },
  personCopy: { flex: 1, gap: 3 },
  personName: { color: colors.ink, fontSize: 9, fontWeight: "700" },
  personDetail: { color: colors.muted, fontSize: 7 },
  chatAction: { width: 32, height: 32, borderRadius: 8, alignItems: "center", justifyContent: "center", backgroundColor: colors.paleGreen },
  chatActionBusy: { opacity: 0.6 },
  rideRow: { minHeight: 54, borderBottomWidth: 1, borderBottomColor: colors.line, flexDirection: "row", alignItems: "center", gap: 8 },
});