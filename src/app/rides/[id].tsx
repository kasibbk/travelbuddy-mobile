import { useCallback, useState } from "react";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { ArrowLeft, CalendarDays, Check, MessageCircle, Pencil, ShieldCheck, Users, X } from "lucide-react-native";
import { ActivityIndicator, Modal, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { useAuth } from "../../components/auth-provider";
import { useStoreVersion } from "../../lib/store-events";
import { Avatar } from "../../components/avatar";
import { EmptyState } from "../../components/empty-state";
import { CreateRideModal } from "../../components/create-ride-modal";
import { colors } from "../../components/theme";
import {
  AdminRequestData,
  cancelRide,
  cancelRideRequest,
  ConversationData,
  createDirectConversation,
  createFriendRequest,
  FriendData,
  leaveRide,
  loadConversations,
  loadFriendRequests,
  loadRideAdmins,
  loadRideDetails,
  loadRideParticipants,
  loadRideRequests,
  loadUserRideRequests,
  requestRide,
  reviewRideRequest,
  RideCardData,
  RideParticipantData,
  RideRequestData,
} from "../../lib/app-data";

type RideTab = "Overview" | "Members" | "Requests";

export default function RideDetailsScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { ready, userId } = useAuth();
  const [ride, setRide] = useState<RideCardData | null>(null);
  const [participants, setParticipants] = useState<RideParticipantData[]>([]);
  const [requests, setRequests] = useState<AdminRequestData[]>([]);
  const [friendships, setFriendships] = useState<FriendData[]>([]);
  const [requestState, setRequestState] = useState<RideRequestData | null>(null);
  const [conversation, setConversation] = useState<ConversationData | null>(null);
  const [directConversations, setDirectConversations] = useState<ConversationData[]>([]);
  const [tab, setTab] = useState<RideTab>("Overview");
  const [isOwner, setIsOwner] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [canSeeMembers, setCanSeeMembers] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [cancelDialog, setCancelDialog] = useState(false);
  const [leaveDialog, setLeaveDialog] = useState(false);
  const [editDialog, setEditDialog] = useState(false);
  const storeVersion = useStoreVersion();

  useFocusEffect(useCallback(() => {
    if (!ready || !userId || !id || Array.isArray(id)) return;
    const viewerId = userId;
    let active = true;
    setError("");
    async function load() {
      try {
        const [rideRow, ownRequests, adminRows, allFriendships, conversations] = await Promise.all([
          loadRideDetails(id, viewerId),
          loadUserRideRequests(viewerId),
          loadRideAdmins([id], viewerId),
          loadFriendRequests(viewerId),
          loadConversations(viewerId),
        ]);
        if (!active) return;
        if (!rideRow) throw new Error("This ride is unavailable.");
        const currentRequest = ownRequests.find((request) => request.rideId === id) ?? null;
        const owned = rideRow.creatorId === viewerId;
        const admin = !!adminRows[id]?.some((item) => item.userId === viewerId);
        const approved = currentRequest?.status === "approved";
        const maySeeMembers = owned || admin || approved;
        setRide(rideRow);
        setRequestState(currentRequest);
        setFriendships(allFriendships);
        setIsOwner(owned);
        setIsAdmin(admin && !owned);
        setCanSeeMembers(maySeeMembers);
        setDirectConversations(conversations.filter((item) => item.kind === "direct"));
        setConversation(conversations.find((item) => item.kind === "ride" && item.rideId === id) ?? null);
        setRequests(owned || admin ? await loadRideRequests(id, viewerId) : []);
        setParticipants(maySeeMembers ? await loadRideParticipants(id, viewerId) : []);
      } catch (cause) {
        if (active) setError(cause instanceof Error ? cause.message : "Could not load this ride.");
      } finally {
        if (active) setLoading(false);
      }
    }
    void load();
    return () => { active = false; };
  }, [ready, userId, id, storeVersion]));

  async function handleRequest() {
    if (!userId || !ride || busy) return;
    setBusy(true);
    setError("");
    try {
      if (requestState?.status === "pending") {
        await cancelRideRequest(requestState.id, userId);
        setRequestState({ ...requestState, status: "cancelled" });
      } else {
        setRequestState(await requestRide(ride.id, userId));
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not update your request.");
    } finally {
      setBusy(false);
    }
  }

  async function confirmCancel() {
    if (!ride || !isOwner || busy) return;
    setBusy(true);
    setError("");
    try {
      await cancelRide(ride.id, userId ?? "");
      setRide({ ...ride, status: "cancelled" });
      setRequests([]);
      setCancelDialog(false);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not cancel this ride.");
    } finally {
      setBusy(false);
    }
  }

  async function confirmLeave() {
    if (!ride || !requestState || requestState.status !== "approved" || busy) return;
    setBusy(true);
    setError("");
    try {
      await leaveRide(ride.id, userId ?? "");
      router.replace("/(tabs)/rides");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not leave this ride.");
      setBusy(false);
    }
  }

  async function addFriend(participantId: string) {
    if (!userId || busy) return;
    setBusy(true);
    setError("");
    try {
      await createFriendRequest(userId, participantId);
      setFriendships(await loadFriendRequests(userId));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not send a friend request.");
    } finally {
      setBusy(false);
    }
  }

  async function openFriendChat(participantId: string, displayName: string) {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const existing = directConversations.find((item) => item.otherUserId === participantId);
      const conversationId = existing?.id ?? await createDirectConversation(participantId, userId ?? "");
      router.push({ pathname: "/chat/[id]", params: { id: conversationId, title: displayName } });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not open this conversation.");
    } finally {
      setBusy(false);
    }
  }

  async function review(request: AdminRequestData, decision: "approved" | "declined") {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      await reviewRideRequest(request.id, decision, userId ?? "");
      setRequests((current) => current.filter((item) => item.id !== request.id));
      if (decision === "approved") {
        setParticipants(await loadRideParticipants(request.rideId, userId ?? "", true));
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not review this request.");
    } finally {
      setBusy(false);
    }
  }

  async function refreshDetails() {
    if (!userId || !id || Array.isArray(id) || refreshing) return;
    setRefreshing(true);
    setError("");
    try {
      const [rideRow, ownRequests, adminRows, allFriendships, conversations] = await Promise.all([
        loadRideDetails(id, userId, true),
        loadUserRideRequests(userId, true),
        loadRideAdmins([id], userId, true),
        loadFriendRequests(userId, true),
        loadConversations(userId, true),
      ]);
      if (!rideRow) throw new Error("This ride is unavailable.");
      const currentRequest = ownRequests.find((request) => request.rideId === id) ?? null;
      const owned = rideRow.creatorId === userId;
      const admin = !!adminRows[id]?.some((item) => item.userId === userId);
      const maySeeMembers = owned || admin || currentRequest?.status === "approved";
      const [rideRequests, rideParticipants] = await Promise.all([
        owned || admin ? loadRideRequests(id, userId, true) : Promise.resolve([] as AdminRequestData[]),
        maySeeMembers ? loadRideParticipants(id, userId, true) : Promise.resolve([] as RideParticipantData[]),
      ]);
      setRide(rideRow);
      setRequestState(currentRequest);
      setFriendships(allFriendships);
      setIsOwner(owned);
      setIsAdmin(admin && !owned);
      setCanSeeMembers(maySeeMembers);
      setDirectConversations(conversations.filter((item) => item.kind === "direct"));
      setConversation(conversations.find((item) => item.kind === "ride" && item.rideId === id) ?? null);
      setRequests(rideRequests);
      setParticipants(rideParticipants);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not refresh this ride.");
    } finally {
      setRefreshing(false);
    }
  }

  const tabs: RideTab[] = isOwner || isAdmin ? ["Overview", "Members", "Requests"] : ["Overview", "Members"];
  const startDate = ride ? new Date(ride.startsAt).toLocaleString(undefined, { weekday: "long", month: "long", day: "numeric", hour: "numeric", minute: "2-digit" }) : "";

  return <View style={styles.screen}>
    <View style={styles.header}><Pressable accessibilityLabel="Back" onPress={() => router.back()} style={styles.back}><ArrowLeft color={colors.ink} size={19} /></Pressable><Text style={styles.headerTitle}>Ride details</Text><View style={{ flex: 1 }} />{conversation && <Pressable accessibilityLabel="Open ride chat" onPress={() => router.push({ pathname: "/chat/[id]", params: { id: conversation.id } })} style={styles.headerAction}><MessageCircle color={colors.forest} size={18} /></Pressable>}</View>
    {loading ? <ActivityIndicator color={colors.leaf} style={styles.loader} /> : error && !ride ? <EmptyState icon={CalendarDays} title="Ride unavailable" description={error} /> : ride ? <>
      <ScrollView refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refreshDetails} tintColor={colors.leaf} colors={[colors.leaf]} />} contentContainerStyle={styles.content}>
        <View style={styles.hero}><Text style={styles.status}>{ride.status === "cancelled" ? "CANCELLED" : ride.status === "completed" ? "COMPLETED" : "OPEN RIDE"}</Text><Text style={styles.title}>{ride.title}</Text><Text style={styles.route}>{ride.route}</Text><View style={styles.meta}><CalendarDays color={colors.leaf} size={15} /><Text style={styles.metaText}>{startDate}</Text></View></View>
        <View style={styles.tabs}>{tabs.map((item) => <Pressable key={item} onPress={() => setTab(item)} style={[styles.tab, item === tab && styles.activeTab]}><Text style={[styles.tabText, item === tab && styles.activeTabText]}>{item}{item === "Requests" && requests.length ? ` · ${requests.length}` : ""}</Text></Pressable>)}</View>

        {tab === "Overview" ? <View style={styles.panel}>
          <Text style={styles.sectionTitle}>About this ride</Text><Text style={styles.description}>{ride.description || "No additional details."}</Text>
          <View style={styles.detailRow}><Text style={styles.detailLabel}>Host</Text><Text style={styles.detailValue}>{ride.host}</Text></View>
          <View style={styles.detailRow}><Text style={styles.detailLabel}>Distance</Text><Text style={styles.detailValue}>{ride.distance}</Text></View>
          <View style={styles.detailRow}><Text style={styles.detailLabel}>Estimated duration</Text><Text style={styles.detailValue}>{ride.duration}</Text></View>
          <View style={styles.detailRow}><Text style={styles.detailLabel}>Rider limit</Text><Text style={styles.detailValue}>{ride.capacity}</Text></View>
          {!!error && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
          {ride.status === "open" && isOwner && <Pressable accessibilityRole="button" onPress={() => setEditDialog(true)} style={[styles.secondaryButton, styles.editButton]}><Pencil color={colors.forest} size={14} /><Text style={styles.secondaryText}>Edit ride details</Text></Pressable>}
          {ride.status === "open" && isOwner && <Pressable accessibilityRole="button" onPress={() => setCancelDialog(true)} style={styles.dangerButton}><X color="#9B493C" size={15} /><Text style={styles.dangerText}>Cancel ride for everyone</Text></Pressable>}
          {ride.status === "open" && !isOwner && !isAdmin && requestState?.status === "approved" && <Pressable accessibilityRole="button" disabled={busy} onPress={() => setLeaveDialog(true)} style={styles.secondaryButton}><Text style={styles.secondaryText}>Leave ride</Text></Pressable>}
          {ride.status === "open" && !isOwner && !isAdmin && requestState?.status !== "approved" && <Pressable accessibilityRole="button" disabled={busy} onPress={handleRequest} style={styles.primaryButton}>{busy ? <ActivityIndicator color={colors.surface} /> : <Text style={styles.primaryText}>{requestState?.status === "pending" ? "Cancel request" : "Request a spot"}</Text>}</Pressable>}
          {conversation && <Pressable accessibilityRole="button" onPress={() => router.push({ pathname: "/chat/[id]", params: { id: conversation.id } })} style={styles.chatButton}><MessageCircle color={colors.surface} size={15} /><Text style={styles.primaryText}>Go to ride chat</Text></Pressable>}
        </View> : tab === "Members" ? canSeeMembers ? participants.length ? <View style={styles.list}>{participants.map((person) => {
          const relationship = friendships.find((friend) => friend.otherUserId === person.userId);
          const isSelf = person.userId === userId;
          return <View key={person.userId} style={styles.personRow}>
            <Pressable accessibilityRole="button" accessibilityState={{ disabled: isSelf }} disabled={isSelf} onPress={() => router.push({ pathname: "/users/[id]", params: { id: person.userId } })} style={styles.personLink}><Avatar initials={person.displayName.split(/\s+/).map((part) => part[0]).join("").slice(0, 2).toUpperCase()} size={38} /><View style={styles.personCopy}><Text style={styles.personName}>{person.displayName}{isSelf ? " · You" : ""}</Text><Text style={styles.personRole}>{person.role}</Text></View></Pressable>
            {!isSelf && relationship?.status === "accepted" ? <Pressable accessibilityRole="button" accessibilityLabel={`Chat with ${person.displayName}`} disabled={busy} onPress={() => openFriendChat(person.userId, person.displayName)} style={[styles.smallAction, busy && styles.actionBusy]}>{busy ? <ActivityIndicator size="small" color={colors.forest} /> : <><MessageCircle color={colors.forest} size={13} /><Text style={styles.smallActionText}>Chat</Text></>}</Pressable> : !isSelf && relationship?.status === "pending" ? <Text style={styles.friendState}>{relationship.direction === "outgoing" ? "Request sent" : "Respond in Friends"}</Text> : !isSelf ? <Pressable disabled={busy} onPress={() => addFriend(person.userId)} style={styles.smallAction}><Text style={styles.smallActionText}>Add friend</Text></Pressable> : null}
          </View>;
        })}</View> : <EmptyState icon={Users} title="No members yet" description="Ride owners and approved riders will appear here." /> : <EmptyState icon={ShieldCheck} title="Members are private" description="Request and get approved to see who’s riding." /> : requests.length ? <View style={styles.list}>{requests.map((request) => <View key={request.id} style={styles.personRow}><View style={styles.personCopy}><Text style={styles.personName}>{request.riderName}</Text><Text style={styles.personRole}>{request.message || "Requested a spot"}</Text></View><Pressable accessibilityLabel={`Approve ${request.riderName}`} disabled={busy} onPress={() => review(request, "approved")} style={styles.approveAction}>{busy ? <ActivityIndicator size="small" color={colors.forest} /> : <Check color={colors.forest} size={17} />}</Pressable><Pressable accessibilityLabel={`Decline ${request.riderName}`} disabled={busy} onPress={() => review(request, "declined")} style={styles.declineAction}><X color="#9B493C" size={16} /></Pressable></View>)}</View> : <EmptyState icon={ShieldCheck} title="No requests yet" description="Pending join requests will appear in this tab." />}
      </ScrollView>
    </> : null}

    {!!error && !!ride && <Text accessibilityRole="alert" style={styles.floatingError}>{error}</Text>}
    <CreateRideModal visible={editDialog} ride={ride ?? undefined} onClose={() => setEditDialog(false)} onCreated={setRide} onUpdated={(updatedRide) => { setRide(updatedRide); setEditDialog(false); }} />
    <ConfirmModal visible={cancelDialog} title="Cancel this ride?" message="The ride will be marked cancelled for everyone and move out of Upcoming." confirmText="Cancel ride" busy={busy} onClose={() => setCancelDialog(false)} onConfirm={confirmCancel} />
    <ConfirmModal visible={leaveDialog} title="Leave this ride?" message="You’ll be removed from the ride and its chat." confirmText="Leave ride" busy={busy} onClose={() => setLeaveDialog(false)} onConfirm={confirmLeave} />
  </View>;
}

function ConfirmModal({ visible, title, message, confirmText, busy, onClose, onConfirm }: { visible: boolean; title: string; message: string; confirmText: string; busy: boolean; onClose: () => void; onConfirm: () => void }) {
  return <Modal transparent visible={visible} animationType="fade" onRequestClose={onClose}><View style={styles.modalBackdrop}><View style={styles.modalPanel}><Text style={styles.modalTitle}>{title}</Text><Text style={styles.modalMessage}>{message}</Text><View style={styles.modalActions}><Pressable disabled={busy} onPress={onClose} style={styles.modalCancel}><Text style={styles.modalCancelText}>Keep ride</Text></Pressable><Pressable disabled={busy} onPress={onConfirm} style={styles.modalConfirm}>{busy ? <ActivityIndicator color={colors.surface} /> : <Text style={styles.modalConfirmText}>{confirmText}</Text>}</Pressable></View></View></View></Modal>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.paper },
  header: { minHeight: 54, paddingHorizontal: 16, flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: colors.paper },
  back: { width: 30, height: 40, justifyContent: "center" }, headerTitle: { color: colors.ink, fontSize: 12, fontWeight: "800" }, headerAction: { width: 34, height: 34, borderRadius: 9, alignItems: "center", justifyContent: "center", backgroundColor: colors.paleGreen },
  content: { paddingBottom: 32 }, hero: { paddingHorizontal: 20, paddingTop: 15, paddingBottom: 19 }, status: { color: colors.leaf, fontSize: 8, fontWeight: "800" }, title: { marginTop: 7, color: colors.ink, fontFamily: "Georgia", fontSize: 28 }, route: { marginTop: 5, color: colors.muted, fontSize: 11 }, meta: { marginTop: 13, flexDirection: "row", alignItems: "center", gap: 7 }, metaText: { color: colors.ink, fontSize: 9 },
  tabs: { marginHorizontal: 16, marginBottom: 12, borderBottomWidth: 1, borderBottomColor: colors.line, flexDirection: "row", gap: 20 }, tab: { paddingBottom: 9 }, activeTab: { borderBottomWidth: 2, borderBottomColor: colors.forest }, tabText: { color: colors.muted, fontSize: 9, fontWeight: "600" }, activeTabText: { color: colors.forest, fontWeight: "800" },
  panel: { marginHorizontal: 16, padding: 15, borderWidth: 1, borderColor: colors.line, borderRadius: 11, backgroundColor: colors.surface }, sectionTitle: { color: colors.ink, fontSize: 12, fontWeight: "800" }, description: { marginTop: 8, color: colors.muted, fontSize: 9, lineHeight: 15 }, detailRow: { minHeight: 36, borderTopWidth: 1, borderTopColor: colors.line, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 }, detailLabel: { color: colors.muted, fontSize: 9 }, detailValue: { color: colors.ink, fontSize: 9, fontWeight: "700" },
  list: { marginHorizontal: 16, paddingHorizontal: 12, borderWidth: 1, borderColor: colors.line, borderRadius: 11, backgroundColor: colors.surface }, personRow: { minHeight: 61, borderBottomWidth: 1, borderBottomColor: colors.line, flexDirection: "row", alignItems: "center", gap: 8 }, personLink: { flex: 1, flexDirection: "row", alignItems: "center", gap: 9 }, personCopy: { flex: 1, gap: 3 }, personName: { color: colors.ink, fontSize: 10, fontWeight: "700" }, personRole: { color: colors.muted, fontSize: 8 }, friendState: { color: colors.leaf, fontSize: 8, fontWeight: "700" }, smallAction: { minHeight: 29, paddingHorizontal: 8, borderRadius: 7, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 5, backgroundColor: colors.paleGreen }, smallActionText: { color: colors.forest, fontSize: 8, fontWeight: "700" }, actionBusy: { opacity: 0.65 }, approveAction: { width: 30, height: 30, borderRadius: 8, alignItems: "center", justifyContent: "center", backgroundColor: colors.paleGreen }, declineAction: { width: 30, height: 30, borderRadius: 8, alignItems: "center", justifyContent: "center", backgroundColor: "#FBF1EB" },
  primaryButton: { minHeight: 40, marginTop: 12, borderRadius: 8, alignItems: "center", justifyContent: "center", backgroundColor: colors.forest }, primaryText: { color: colors.surface, fontSize: 9, fontWeight: "700" }, chatButton: { minHeight: 40, marginTop: 9, borderRadius: 8, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 7, backgroundColor: colors.forest }, secondaryButton: { minHeight: 38, marginTop: 12, borderWidth: 1, borderColor: colors.line, borderRadius: 8, alignItems: "center", justifyContent: "center" }, editButton: { flexDirection: "row", gap: 7 }, secondaryText: { color: colors.forest, fontSize: 9, fontWeight: "700" }, dangerButton: { minHeight: 38, marginTop: 12, borderWidth: 1, borderColor: "#EBD6CF", borderRadius: 8, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, backgroundColor: "#FBF1EB" }, dangerText: { color: "#9B493C", fontSize: 9, fontWeight: "700" }, error: { marginTop: 9, color: "#9B493C", fontSize: 8 }, floatingError: { marginHorizontal: 16, marginBottom: 6, color: "#9B493C", fontSize: 8 }, loader: { marginVertical: 26 },
  modalBackdrop: { flex: 1, padding: 20, justifyContent: "center", backgroundColor: "#13251F99" }, modalPanel: { padding: 17, borderRadius: 12, backgroundColor: colors.surface }, modalTitle: { color: colors.ink, fontFamily: "Georgia", fontSize: 20 }, modalMessage: { marginTop: 8, color: colors.muted, fontSize: 9, lineHeight: 14 }, modalActions: { marginTop: 16, flexDirection: "row", justifyContent: "flex-end", gap: 8 }, modalCancel: { minHeight: 36, paddingHorizontal: 12, borderWidth: 1, borderColor: colors.line, borderRadius: 7, justifyContent: "center" }, modalCancelText: { color: colors.ink, fontSize: 9 }, modalConfirm: { minWidth: 86, minHeight: 36, paddingHorizontal: 12, borderRadius: 7, alignItems: "center", justifyContent: "center", backgroundColor: "#9B493C" }, modalConfirmText: { color: colors.surface, fontSize: 9, fontWeight: "700" },
});