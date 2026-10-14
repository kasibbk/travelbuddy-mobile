import { useCallback, useMemo, useState } from "react";
import { useFocusEffect, useRouter } from "expo-router";
import { CalendarDays, Check, ShieldCheck, UserPlus, X } from "lucide-react-native";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { AppHeader } from "../../../components/app-header";
import { AssignRideAdminModal } from "../../../components/assign-ride-admin-modal";
import { EmptyState } from "../../../components/empty-state";
import { PageShell } from "../../../components/page-shell";
import { RideCard } from "../../../components/ride-card";
import { colors } from "../../../components/theme";
import { useAuth } from "../../../components/auth-provider";
import {
  AdminRequestData,
  FriendData,
  loadFriendRequests,
  loadPendingAdminRequests,
  loadRideAdmins,
  loadUserRides,
  reviewRideRequest,
  RideAdminData,
  RideCardData,
} from "../../../lib/app-data";

export default function MyRidesScreen() {
  const router = useRouter();
  const [tab, setTab] = useState("Upcoming");
  const { ready, userId } = useAuth();
  const [rides, setRides] = useState<RideCardData[]>([]);
  const [requests, setRequests] = useState<AdminRequestData[]>([]);
  const [friends, setFriends] = useState<FriendData[]>([]);
  const [rideAdmins, setRideAdmins] = useState<Record<string, RideAdminData[]>>({});
  const [adminRideId, setAdminRideId] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const [reviewing, setReviewing] = useState<{ requestId: string; decision: "approved" | "declined" } | null>(null);
  const [reviewErrors, setReviewErrors] = useState<Record<string, string>>({});

  useFocusEffect(useCallback(() => {
    if (!ready) return;
    if (!userId) {
      setRides([]);
      setRequests([]);
      setFriends([]);
      setRideAdmins({});
      setLoading(false);
      return;
    }
    let active = true;
    setLoading(true);
    setError("");
    Promise.all([loadUserRides(userId), loadPendingAdminRequests(userId), loadFriendRequests(userId)])
      .then(async ([userRides, pendingRequests, friendRows]) => {
        const ownedRideIds = userRides.filter((ride) => ride.creatorId === userId).map((ride) => ride.id);
        const adminsByRide = await loadRideAdmins(ownedRideIds);
        if (!active) return;
        setRides(userRides);
        setRequests(pendingRequests);
        setFriends(friendRows);
        setRideAdmins(adminsByRide);
      })
      .catch((cause: unknown) => { if (active) setError(cause instanceof Error ? cause.message : "Could not load your rides."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [ready, userId]));

  const now = Date.now();
  const upcoming = useMemo(() => rides.filter((ride) => ride.status === "open" && new Date(ride.startsAt).getTime() >= now), [rides, now]);
  const past = useMemo(() => rides.filter((ride) => ride.status !== "open" || new Date(ride.startsAt).getTime() < now), [rides, now]);
  const visibleRides = tab === "Past" ? past : upcoming;
  const ownedUpcomingRides = upcoming.filter((ride) => ride.creatorId === userId);
  const selectedAdminRide = rides.find((ride) => ride.id === adminRideId) ?? null;

  function addAssignedFriend(rideId: string, friend: FriendData) {
    setRideAdmins((current) => {
      const admins = current[rideId] ?? [];
      if (admins.some((admin) => admin.userId === friend.otherUserId)) return current;
      return { ...current, [rideId]: [...admins, { rideId, userId: friend.otherUserId, name: friend.name, role: "admin" }] };
    });
  }

  async function reviewRequest(request: AdminRequestData, decision: "approved" | "declined") {
    if (reviewing) return;
    setReviewing({ requestId: request.id, decision });
    setReviewErrors((current) => ({ ...current, [request.id]: "" }));
    try {
      await reviewRideRequest(request.id, decision);
      setRequests((current) => current.filter((item) => item.id !== request.id));
    } catch (cause) {
      setReviewErrors((current) => ({ ...current, [request.id]: cause instanceof Error ? cause.message : "Could not review this request." }));
    } finally {
      setReviewing(null);
    }
  }

  async function refreshData() {
    if (!userId || refreshing) return;
    setRefreshing(true);
    setError("");
    try {
      const [userRides, pendingRequests, friendRows] = await Promise.all([loadUserRides(userId), loadPendingAdminRequests(userId), loadFriendRequests(userId)]);
      const ownedRideIds = userRides.filter((ride) => ride.creatorId === userId).map((ride) => ride.id);
      const adminsByRide = await loadRideAdmins(ownedRideIds);
      setRides(userRides);
      setRequests(pendingRequests);
      setFriends(friendRows);
      setRideAdmins(adminsByRide);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not refresh your rides.");
    } finally {
      setRefreshing(false);
    }
  }

  return <PageShell refreshing={refreshing} onRefresh={refreshData}>
    <AppHeader eyebrow="YOUR ROUTES, YOUR CREW" title="My rides" subtitle="Everything you’re planning or taking the lead on." />
    <View style={styles.stats}>
      <Stat value={String(upcoming.length).padStart(2, "0")} label="UPCOMING" />
      <View style={styles.statDivider} />
      <Stat value={String(requests.length).padStart(2, "0")} label="TO REVIEW" />
      <View style={styles.statDivider} />
      <Stat value={String(past.length).padStart(2, "0")} label="COMPLETED" />
    </View>
    <View style={styles.tabs}>
      {["Upcoming", "Requests", "Past", "Admins"].map((item) => <Pressable key={item} style={[styles.tab, tab === item && styles.activeTab]} onPress={() => setTab(item)}>
        <Text style={[styles.tabText, tab === item && styles.activeTabText]}>{item}{item === "Requests" && requests.length ? ` · ${requests.length}` : ""}</Text>
      </Pressable>)}
    </View>

    {loading ? <ActivityIndicator color={colors.leaf} style={styles.loader} /> : error ? <EmptyState icon={ShieldCheck} title="Your rides couldn’t load" description={error} /> : tab === "Requests" ? requests.length ? <View style={styles.requestPanel}>
      <View style={styles.requestHeader}><View><Text style={styles.eyebrow}>YOU’RE THE RIDE ADMIN</Text><Text style={styles.panelTitle}>Join requests</Text></View><ShieldCheck color={colors.leaf} size={21} /></View>
      <Text style={styles.helper}>Pending requests for rides you administer.</Text>
      {requests.map((request) => {
        const isReviewing = reviewing?.requestId === request.id;
        return <View style={styles.requestRow} key={request.id}>
          <View style={styles.requestAvatar}><Text style={styles.requestInitials}>{request.riderName.split(/\s+/).map((part) => part[0]).join("").slice(0, 2).toUpperCase()}</Text></View>
          <View style={styles.requestInfo}>
            <Text style={styles.requestName}>{request.riderName}</Text>
            <Text style={styles.requestMessage}>{request.message || "Requested to join"} · {request.rideTitle}</Text>
            {!!reviewErrors[request.id] && <Text accessibilityRole="alert" style={styles.requestError}>{reviewErrors[request.id]}</Text>}
          </View>
          <Pressable accessibilityLabel={`Approve ${request.riderName}`} disabled={!!reviewing} onPress={() => reviewRequest(request, "approved")} style={[styles.decisionButton, styles.approveButton, !!reviewing && styles.decisionDisabled]}>
            {isReviewing && reviewing.decision === "approved" ? <ActivityIndicator size="small" color={colors.forest} /> : <Check color={colors.forest} size={17} />}
          </Pressable>
          <Pressable accessibilityLabel={`Decline ${request.riderName}`} disabled={!!reviewing} onPress={() => reviewRequest(request, "declined")} style={[styles.decisionButton, styles.declineButton, !!reviewing && styles.decisionDisabled]}>
            {isReviewing && reviewing.decision === "declined" ? <ActivityIndicator size="small" color="#9B684F" /> : <X color="#9B684F" size={16} />}
          </Pressable>
        </View>;
      })}
    </View> : <EmptyState icon={ShieldCheck} title="No requests to review" description="Join requests for rides you administer will appear here." /> : tab === "Admins" ? ownedUpcomingRides.length ? <View style={styles.adminList}>
      {ownedUpcomingRides.map((ride) => {
        const admins = rideAdmins[ride.id] ?? [];
        const adminNames = admins.map((admin) => admin.role === "owner" ? `${admin.name} · owner` : admin.name).join(", ");
        return <View key={ride.id} style={styles.adminRide}>
          <View style={styles.adminRideHeader}><View style={styles.adminRideCopy}><Text numberOfLines={1} style={styles.adminRideTitle}>{ride.title}</Text><Text numberOfLines={1} style={styles.adminRideRoute}>{ride.route}</Text></View><ShieldCheck color={colors.leaf} size={18} /></View>
          <Text style={styles.adminNames}>{adminNames || "You are the ride owner."}</Text>
          <Pressable accessibilityRole="button" accessibilityLabel={`Assign a co-admin for ${ride.title}`} onPress={() => setAdminRideId(ride.id)} style={styles.assignButton}><UserPlus color={colors.surface} size={14} /><Text style={styles.assignButtonText}>Assign co-admin</Text></Pressable>
        </View>;
      })}
    </View> : <EmptyState icon={ShieldCheck} title="No rides to manage" description="Upcoming rides you created will appear here for co-admin assignment." /> : visibleRides.length ? <View style={styles.rideList}>
      {visibleRides.map((ride) => <RideCard key={ride.id} ride={ride} onViewDetails={() => router.push({ pathname: "/rides/[id]", params: { id: ride.id } })} />)}
    </View> : <EmptyState icon={CalendarDays} title={tab === "Past" ? "No past rides yet" : "No upcoming rides yet"} description="Rides you create, administer, or are approved to join will appear here." />}

    <AssignRideAdminModal visible={!!selectedAdminRide} ride={selectedAdminRide} friends={friends} admins={selectedAdminRide ? rideAdmins[selectedAdminRide.id] ?? [] : []} assignedBy={userId ?? ""} onClose={() => setAdminRideId("")} onAssigned={(friend) => selectedAdminRide && addAssignedFriend(selectedAdminRide.id, friend)} />
  </PageShell>;
}

function Stat({ value, label }: { value: string; label: string }) {
  return <View style={styles.stat}><Text style={styles.statValue}>{value}</Text><Text style={styles.statLabel}>{label}</Text></View>;
}

const styles = StyleSheet.create({
  stats: { marginHorizontal: 20, marginBottom: 17, paddingVertical: 14, borderRadius: 12, backgroundColor: colors.surface, flexDirection: "row", alignItems: "center", justifyContent: "space-around" },
  stat: { alignItems: "center", gap: 3 }, statValue: { color: colors.ink, fontFamily: "Georgia", fontSize: 21 }, statLabel: { color: colors.muted, fontSize: 7, fontWeight: "800", letterSpacing: 0.7 }, statDivider: { width: 1, height: 28, backgroundColor: colors.line },
  tabs: { marginHorizontal: 20, marginBottom: 14, padding: 3, borderRadius: 9, backgroundColor: "#EAEEE6", flexDirection: "row" },
  tab: { flex: 1, minHeight: 34, borderRadius: 7, alignItems: "center", justifyContent: "center" }, activeTab: { backgroundColor: colors.surface }, tabText: { color: colors.muted, fontSize: 8, fontWeight: "600" }, activeTabText: { color: colors.forest, fontWeight: "800" },
  rideList: { gap: 12, paddingHorizontal: 16 },
  requestPanel: { marginHorizontal: 16, padding: 15, borderWidth: 1, borderColor: colors.line, borderRadius: 12, backgroundColor: colors.surface },
  requestHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" }, eyebrow: { color: colors.muted, fontSize: 8, fontWeight: "800", letterSpacing: 0.8 }, panelTitle: { marginTop: 4, color: colors.ink, fontFamily: "Georgia", fontSize: 21 }, helper: { marginTop: 8, marginBottom: 11, color: colors.muted, fontSize: 9, lineHeight: 14 },
  requestRow: { minHeight: 57, borderTopWidth: 1, borderTopColor: colors.line, flexDirection: "row", alignItems: "center", gap: 8 }, requestInfo: { flex: 1, gap: 3 }, requestName: { color: colors.ink, fontSize: 10, fontWeight: "700" }, requestMessage: { color: colors.muted, fontSize: 7 }, requestError: { color: "#9B493C", fontSize: 7 }, requestAvatar: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center", backgroundColor: colors.leaf }, requestInitials: { color: colors.surface, fontSize: 9, fontWeight: "800" },
  decisionButton: { width: 32, height: 32, borderRadius: 8, alignItems: "center", justifyContent: "center" }, approveButton: { backgroundColor: "#EAF0DF" }, declineButton: { backgroundColor: "#FBF1EB" }, decisionDisabled: { opacity: 0.55 },
  adminList: { gap: 10, paddingHorizontal: 16 }, adminRide: { padding: 13, borderWidth: 1, borderColor: colors.line, borderRadius: 10, backgroundColor: colors.surface }, adminRideHeader: { flexDirection: "row", alignItems: "center", gap: 8 }, adminRideCopy: { flex: 1, gap: 4 }, adminRideTitle: { color: colors.ink, fontSize: 11, fontWeight: "700" }, adminRideRoute: { color: colors.muted, fontSize: 8 }, adminNames: { marginTop: 10, color: colors.muted, fontSize: 8, lineHeight: 13 }, assignButton: { minHeight: 35, marginTop: 10, borderRadius: 8, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 6, backgroundColor: colors.forest }, assignButtonText: { color: colors.surface, fontSize: 9, fontWeight: "700" },
  loader: { marginVertical: 26 },
});