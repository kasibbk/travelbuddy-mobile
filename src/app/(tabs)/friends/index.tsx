import { useCallback, useMemo, useState } from "react";
import { Check, MapPin, MessageCircle, Search, UserPlus, Users, X } from "lucide-react-native";
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { AppHeader } from "../../../components/app-header";
import { EmptyState } from "../../../components/empty-state";
import { PageShell } from "../../../components/page-shell";
import { colors } from "../../../components/theme";
import { useAuth } from "../../../components/auth-provider";
import { createDirectConversation, createFriendRequest, FriendData, loadFriendRequests, loadNearbyRiders, NearbyRiderData, respondToFriendRequest } from "../../../lib/app-data";

export default function FriendsScreen() {
  const router = useRouter();
  const { ready, userId } = useAuth();
  const [tab, setTab] = useState<"Nearby" | "Friends" | "Requests">("Nearby");
  const [query, setQuery] = useState("");
  const [nearby, setNearby] = useState<NearbyRiderData[]>([]);
  const [friendRequests, setFriendRequests] = useState<FriendData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busyKey, setBusyKey] = useState("");
  const [actionErrors, setActionErrors] = useState<Record<string, string>>({});

  useFocusEffect(useCallback(() => {
    if (!ready) return;
    if (!userId) {
      setNearby([]);
      setFriendRequests([]);
      setLoading(false);
      return;
    }
    let active = true;
    setLoading(true);
    setError("");
    Promise.all([loadNearbyRiders(), loadFriendRequests(userId)])
      .then(([nearbyRows, friendRows]) => {
        if (active) {
          setNearby(nearbyRows);
          setFriendRequests(friendRows);
        }
      })
      .catch((cause: unknown) => { if (active) setError(cause instanceof Error ? cause.message : "Could not load riders."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [ready, userId]));

  const visibleNearby = useMemo(() => nearby.filter((person) => person.name.toLowerCase().includes(query.toLowerCase())), [nearby, query]);
  const acceptedFriends = useMemo(() => friendRequests.filter((friend) => friend.status === "accepted" && friend.name.toLowerCase().includes(query.toLowerCase())), [friendRequests, query]);
  const pendingRequests = useMemo(() => friendRequests.filter((friend) => friend.status === "pending" && friend.name.toLowerCase().includes(query.toLowerCase())), [friendRequests, query]);
  const people = tab === "Nearby" ? visibleNearby : tab === "Friends" ? acceptedFriends : pendingRequests;

  async function sendRequest(person: NearbyRiderData) {
    if (!userId || busyKey) return;
    setBusyKey(person.id);
    setActionErrors((current) => ({ ...current, [person.id]: "" }));
    try {
      await createFriendRequest(userId, person.id);
      setFriendRequests(await loadFriendRequests(userId));
    } catch (cause) {
      setActionErrors((current) => ({ ...current, [person.id]: cause instanceof Error ? cause.message : "Could not send the friend request." }));
    } finally {
      setBusyKey("");
    }
  }

  async function answerRequest(friend: FriendData, accept: boolean) {
    if (!userId || busyKey) return;
    setBusyKey(friend.id);
    setActionErrors((current) => ({ ...current, [friend.id]: "" }));
    try {
      await respondToFriendRequest(friend.id, accept);
      setFriendRequests(await loadFriendRequests(userId));
    } catch (cause) {
      setActionErrors((current) => ({ ...current, [friend.id]: cause instanceof Error ? cause.message : "Could not respond to the friend request." }));
    } finally {
      setBusyKey("");
    }
  }

  async function openChat(friend: FriendData) {
    if (!userId || busyKey) return;
    setBusyKey(friend.id);
    setActionErrors((current) => ({ ...current, [friend.id]: "" }));
    try {
      const conversationId = await createDirectConversation(friend.otherUserId);
      router.push({ pathname: "/chat/[id]", params: { id: conversationId, title: friend.name } });
    } catch (cause) {
      setActionErrors((current) => ({ ...current, [friend.id]: cause instanceof Error ? cause.message : "Could not open this conversation." }));
    } finally {
      setBusyKey("");
    }
  }

  return <PageShell><AppHeader eyebrow="GOOD COMPANY TRAVELS" title="Find your people" subtitle="Meet nearby riders. Make your next ride a reunion." />
    <View style={styles.locationCard}><View style={styles.locationIcon}><MapPin color={colors.leaf} size={17} /></View><View style={styles.locationCopy}><Text style={styles.locationTitle}>Location-based discovery</Text><Text style={styles.locationSubtitle}>Only opted-in riders with a saved location appear.</Text></View></View>
    <View style={styles.tabs}>{(["Nearby", "Friends", "Requests"] as const).map((item) => <Pressable key={item} onPress={() => setTab(item)} style={[styles.tab, tab === item && styles.tabActive]}><Text style={[styles.tabText, tab === item && styles.tabTextActive]}>{item}</Text></Pressable>)}</View>
    <View style={styles.search}><Search color={colors.subtle} size={16} /><TextInput value={query} onChangeText={setQuery} placeholder="Search riders nearby" placeholderTextColor={colors.subtle} style={styles.searchInput} /></View>
    <View style={styles.listHeader}><Text style={styles.eyebrow}>{tab === "Nearby" ? "RIDERS NEAR YOUR LOCATION" : tab === "Friends" ? "ACCEPTED FRIENDS" : "PENDING FRIEND REQUESTS"}</Text><Text style={styles.count}>{loading ? "…" : people.length}</Text></View>
    {loading ? <ActivityIndicator color={colors.leaf} style={styles.loader} /> : error ? <EmptyState icon={Users} title="Riders couldn’t load" description={error} /> : people.length ? <View style={styles.peopleList}>{people.map((person) => {
      const isNearby = "distanceKm" in person;
      const relationship = isNearby ? friendRequests.find((friend) => friend.otherUserId === person.id) : person;
      const initials = person.name.split(/\s+/).map((part) => part[0]).join("").slice(0, 2).toUpperCase();
      const detail = isNearby ? `${person.city ?? "Nearby"} · ${person.distanceKm.toFixed(1)} km away` : person.status === "accepted" ? "Friend" : person.direction === "incoming" ? "Incoming request" : "Request sent";
      const status = isNearby ? relationship?.status === "accepted" ? "Friend" : relationship?.status === "pending" ? relationship.direction === "outgoing" ? "Request sent" : "Respond in Requests" : "Nearby" : detail;
      const actionKey = isNearby ? person.id : person.id;
      return <View style={styles.personCard} key={person.id}>
        <View style={styles.personAvatar}><Text style={styles.personInitials}>{initials}</Text></View>
        <View style={styles.personInfo}><Text style={styles.personName}>{person.name}</Text><Text style={styles.personNote}>{detail}</Text>{!!actionErrors[actionKey] && <Text accessibilityRole="alert" style={styles.actionError}>{actionErrors[actionKey]}</Text>}</View>
        {tab === "Nearby" && isNearby && (!relationship || relationship.status === "declined") ? <Pressable accessibilityLabel={`Send friend request to ${person.name}`} disabled={!!busyKey} onPress={() => sendRequest(person)} style={[styles.actionButton, styles.addButton, !!busyKey && styles.actionDisabled]}>{busyKey === person.id ? <ActivityIndicator size="small" color={colors.forest} /> : <UserPlus color={colors.forest} size={15} />}</Pressable> : tab === "Requests" && !isNearby && person.direction === "incoming" ? <View style={styles.actions}><Pressable accessibilityLabel={`Accept friend request from ${person.name}`} disabled={!!busyKey} onPress={() => answerRequest(person, true)} style={[styles.actionButton, styles.acceptButton, !!busyKey && styles.actionDisabled]}>{busyKey === person.id ? <ActivityIndicator size="small" color={colors.forest} /> : <Check color={colors.forest} size={16} />}</Pressable><Pressable accessibilityLabel={`Decline friend request from ${person.name}`} disabled={!!busyKey} onPress={() => answerRequest(person, false)} style={[styles.actionButton, styles.declineButton, !!busyKey && styles.actionDisabled]}><X color="#9B684F" size={15} /></Pressable></View> : tab === "Friends" && !isNearby ? <Pressable accessibilityLabel={`Message ${person.name}`} disabled={!!busyKey} onPress={() => openChat(person)} style={[styles.actionButton, styles.chatButton, !!busyKey && styles.actionDisabled]}>{busyKey === person.id ? <ActivityIndicator size="small" color={colors.forest} /> : <MessageCircle color={colors.forest} size={15} />}</Pressable> : <Text style={styles.statusText}>{status}</Text>}
      </View>;
    })}</View> : <EmptyState icon={tab === "Nearby" ? MapPin : Users} title={tab === "Nearby" ? "No nearby riders yet" : tab === "Friends" ? "No friends yet" : "No pending requests"} description={tab === "Nearby" ? "Nearby suggestions appear for opted-in riders with a saved location in range." : tab === "Friends" ? "Accepted friend connections will appear here." : "Incoming and outgoing requests involving your account will appear here."} />}
  </PageShell>;
}

const styles = StyleSheet.create({
  locationCard: { marginHorizontal: 16, marginBottom: 16, padding: 12, borderRadius: 11, backgroundColor: "#E8EDDF", flexDirection: "row", alignItems: "center", gap: 10 },
  locationIcon: { width: 32, height: 32, borderRadius: 9, alignItems: "center", justifyContent: "center", backgroundColor: "#F8F9F3" }, locationCopy: { flex: 1, gap: 3 }, locationTitle: { color: colors.ink, fontSize: 10, fontWeight: "700" }, locationSubtitle: { color: colors.muted, fontSize: 8 },
  tabs: { marginHorizontal: 20, marginBottom: 12, borderBottomWidth: 1, borderBottomColor: colors.line, flexDirection: "row", gap: 20 }, tab: { paddingBottom: 9 }, tabActive: { borderBottomWidth: 2, borderBottomColor: colors.forest }, tabText: { color: colors.muted, fontSize: 10, fontWeight: "600" }, tabTextActive: { color: colors.forest, fontWeight: "800" },
  search: { height: 39, marginHorizontal: 16, marginBottom: 18, paddingHorizontal: 11, borderWidth: 1, borderColor: colors.line, borderRadius: 8, backgroundColor: colors.surface, flexDirection: "row", alignItems: "center", gap: 8 }, searchInput: { flex: 1, color: colors.ink, fontSize: 10 },
  listHeader: { marginHorizontal: 20, marginBottom: 7, flexDirection: "row", justifyContent: "space-between", alignItems: "center" }, eyebrow: { color: colors.muted, fontSize: 7, fontWeight: "800", letterSpacing: 0.7 }, count: { color: colors.subtle, fontSize: 8 },
  peopleList: { marginHorizontal: 16, paddingHorizontal: 12, borderWidth: 1, borderColor: colors.line, borderRadius: 11, backgroundColor: colors.surface }, personCard: { minHeight: 66, borderBottomWidth: 1, borderBottomColor: "#EEF0E9", flexDirection: "row", alignItems: "center", gap: 9 }, personAvatar: { width: 38, height: 38, borderRadius: 20, alignItems: "center", justifyContent: "center", backgroundColor: colors.leaf }, personInitials: { color: colors.surface, fontSize: 10, fontWeight: "800" }, personInfo: { flex: 1, gap: 4 }, personName: { color: colors.ink, fontSize: 10, fontWeight: "700" }, personNote: { color: colors.muted, fontSize: 8 }, statusText: { color: colors.leaf, fontSize: 8, fontWeight: "700" }, actions: { flexDirection: "row", gap: 5 }, actionButton: { width: 30, height: 30, borderRadius: 8, alignItems: "center", justifyContent: "center" }, addButton: { backgroundColor: "#EAF0DF" }, acceptButton: { backgroundColor: "#EAF0DF" }, chatButton: { backgroundColor: "#EAF0DF" }, declineButton: { backgroundColor: "#FBF1EB" }, actionDisabled: { opacity: 0.55 }, actionError: { color: "#9B493C", fontSize: 7, lineHeight: 10 }, loader: { marginVertical: 22 },
});