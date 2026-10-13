import { useCallback, useEffect, useMemo, useState } from "react";
import { useFocusEffect } from "expo-router";
import { MapPin, Navigation, Search, Users } from "lucide-react-native";
import { ActivityIndicator, StyleSheet, Text, TextInput, View } from "react-native";
import { AppHeader } from "../../components/app-header";
import { CreateRideModal } from "../../components/create-ride-modal";
import { EmptyState } from "../../components/empty-state";
import { PageShell } from "../../components/page-shell";
import { RideCard } from "../../components/ride-card";
import { colors } from "../../components/theme";
import { useAuth } from "../../components/auth-provider";
import { cancelRideRequest, loadNearbyRiders, loadOpenRides, loadUserRideRequests, NearbyRiderData, requestRide, RideCardData, RideRequestData } from "../../lib/app-data";

export default function DiscoverScreen() {
  const { ready, userId } = useAuth();
  const [search, setSearch] = useState("");
  const [rides, setRides] = useState<RideCardData[]>([]);
  const [requestsByRide, setRequestsByRide] = useState<Record<string, RideRequestData>>({});
  const [busyRideIds, setBusyRideIds] = useState<Record<string, boolean>>({});
  const [requestErrors, setRequestErrors] = useState<Record<string, string>>({});
  const [requestsLoading, setRequestsLoading] = useState(true);
  const [requestLoadError, setRequestLoadError] = useState("");
  const [nearbyRiders, setNearbyRiders] = useState<NearbyRiderData[]>([]);
  const [ridesLoading, setRidesLoading] = useState(true);
  const [nearbyLoading, setNearbyLoading] = useState(true);
  const [ridesError, setRidesError] = useState("");
  const [nearbyError, setNearbyError] = useState("");
  const [createRideVisible, setCreateRideVisible] = useState(false);

  useEffect(() => {
    if (!ready) return;
    let active = true;
    setRidesLoading(true);
    setRidesError("");
    loadOpenRides().then((rows) => { if (active) setRides(rows); })
      .catch((cause: unknown) => { if (active) setRidesError(cause instanceof Error ? cause.message : "Could not load rides."); })
      .finally(() => { if (active) setRidesLoading(false); });
    return () => { active = false; };
  }, [ready, userId]);

  useFocusEffect(useCallback(() => {
    if (!ready) return;
    let active = true;
    setNearbyLoading(true);
    setNearbyError("");
    loadNearbyRiders()
      .then((rows) => { if (active) setNearbyRiders(rows); })
      .catch((cause: unknown) => { if (active) setNearbyError(cause instanceof Error ? cause.message : "Could not load nearby riders."); })
      .finally(() => { if (active) setNearbyLoading(false); });
    return () => { active = false; };
  }, [ready]));

  useFocusEffect(useCallback(() => {
    if (!ready) return;
    if (!userId) {
      setRequestsByRide({});
      setRequestsLoading(false);
      setRequestLoadError("");
      return;
    }
    let active = true;
    setRequestsLoading(true);
    setRequestLoadError("");
    loadUserRideRequests(userId)
      .then((requests) => {
        if (!active) return;
        const latestByRide: Record<string, RideRequestData> = {};
        for (const request of requests) if (!latestByRide[request.rideId]) latestByRide[request.rideId] = request;
        setRequestsByRide(latestByRide);
      })
      .catch((cause: unknown) => { if (active) setRequestLoadError(cause instanceof Error ? cause.message : "Could not load your ride request status."); })
      .finally(() => { if (active) setRequestsLoading(false); });
    return () => { active = false; };
  }, [ready, userId]));

  async function handleRideRequest(ride: RideCardData) {
    if (!userId || busyRideIds[ride.id]) return;
    setBusyRideIds((current) => ({ ...current, [ride.id]: true }));
    setRequestErrors((current) => ({ ...current, [ride.id]: "" }));
    try {
      const currentRequest = requestsByRide[ride.id];
      if (currentRequest?.status === "pending") {
        await cancelRideRequest(currentRequest.id);
        setRequestsByRide((current) => ({ ...current, [ride.id]: { ...current[ride.id], status: "cancelled" } }));
      } else {
        const createdRequest = await requestRide(ride.id, userId);
        setRequestsByRide((current) => ({ ...current, [ride.id]: createdRequest }));
      }
    } catch (cause) {
      setRequestErrors((current) => ({ ...current, [ride.id]: cause instanceof Error ? cause.message : "Could not update your ride request." }));
    } finally {
      setBusyRideIds((current) => ({ ...current, [ride.id]: false }));
    }
  }

  const visibleRides = useMemo(() => rides.filter((ride) => `${ride.title} ${ride.route} ${ride.host}`.toLowerCase().includes(search.toLowerCase())), [rides, search]);

  return <PageShell>
    <AppHeader eyebrow="YOUR RIDE BOARD" title="Find your next ride." subtitle="Open rides from TravelBuddy riders." onCreate={() => setCreateRideVisible(true)} />
    <View style={styles.sectionHeading}><View><Text style={styles.eyebrow}>OPEN RIDES</Text><Text style={styles.sectionTitle}>Rides on the board</Text></View><Text style={styles.count}>{rides.length}</Text></View>
    <View style={styles.search}><Search color={colors.subtle} size={16} /><TextInput value={search} onChangeText={setSearch} placeholder="Search rides or routes" placeholderTextColor={colors.subtle} style={styles.searchInput} /></View>
    {ridesLoading ? <ActivityIndicator color={colors.leaf} style={styles.loader} /> : ridesError ? <EmptyState icon={MapPin} title="Rides couldn’t load" description={ridesError} /> : visibleRides.length ? <View style={styles.rideList}>{visibleRides.map((ride) => <RideCard key={ride.id} ride={ride} viewerIsOwner={ride.creatorId === userId} requestState={requestsByRide[ride.id]} actionPending={Boolean(busyRideIds[ride.id])} actionDisabled={requestsLoading || !!requestLoadError} actionError={requestErrors[ride.id] || requestLoadError} onRequestSpot={() => handleRideRequest(ride)} onCancelRequest={() => handleRideRequest(ride)} />)}</View> : <EmptyState icon={MapPin} title={search ? "No matching rides" : "No open rides yet"} description={search ? "Try another route or clear your search." : "When riders publish open trips, they’ll appear here."} />}
    <View style={styles.nearbySection}><View style={styles.sectionHeading}><View><Text style={styles.eyebrow}>LOCATION-BASED SUGGESTIONS</Text><Text style={styles.sectionTitle}>Riders nearby</Text></View><Navigation color={colors.leaf} size={18} /></View>
      {nearbyLoading ? <ActivityIndicator color={colors.leaf} style={styles.loader} /> : nearbyError ? <EmptyState icon={Users} title="Nearby riders couldn’t load" description={nearbyError} /> : nearbyRiders.length ? <View style={styles.peopleList}>{nearbyRiders.map((person) => <View style={styles.personRow} key={person.id}><View style={styles.personAvatar}><Text style={styles.personInitials}>{person.name.split(/\s+/).map((part) => part[0]).join("").slice(0, 2).toUpperCase()}</Text></View><View style={styles.personInfo}><Text style={styles.personName}>{person.name}</Text><Text style={styles.personNote}>{person.city ?? "Nearby rider"} · {person.distanceKm.toFixed(1)} km</Text></View></View>)}</View> : <EmptyState icon={Users} title="No nearby riders to show" description="Suggestions appear when you share an approximate location and opted-in riders are in range." />}
    </View>
    <CreateRideModal visible={createRideVisible} onClose={() => setCreateRideVisible(false)} onCreated={(ride) => setRides((current) => [ride, ...current.filter((item) => item.id !== ride.id)].sort((left, right) => left.startsAt.localeCompare(right.startsAt)))} />
  </PageShell>;
}

const styles = StyleSheet.create({
  feature: { marginHorizontal: 16, padding: 17, borderRadius: 16, backgroundColor: colors.forest },
  featureTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 12 },
  liveLabel: { flexDirection: "row", alignItems: "center", gap: 6 },
  liveDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.lime },
  featureEyebrow: { color: "#D4E1D1", fontSize: 8, fontWeight: "800", letterSpacing: 1 },
  featureIndex: { color: "#B8CCB9", fontSize: 8, fontWeight: "700" },
  featureTitle: { marginBottom: 7, color: "#F7F8EE", fontFamily: "Georgia", fontSize: 35, fontWeight: "500", lineHeight: 36 },
  featureDescription: { maxWidth: 245, marginBottom: 14, color: "#D4E0D6", fontSize: 10, lineHeight: 15 },
  featureMeta: { gap: 8, marginTop: 13 },
  metaItem: { flexDirection: "row", alignItems: "center", gap: 7 },
  metaText: { color: "#E1EADD", fontSize: 8, fontWeight: "700", letterSpacing: 0.35 },
  featureButton: { minHeight: 39, marginTop: 14, paddingHorizontal: 12, borderRadius: 8, backgroundColor: "#E7F1C7", flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  featureButtonText: { color: colors.ink, fontSize: 10, fontWeight: "800" },
  distanceNote: { marginTop: 10, color: "#AEC5B2", fontSize: 7, fontWeight: "700", letterSpacing: 0.8, textAlign: "center" },
  search: { height: 39, marginHorizontal: 16, marginBottom: 18, paddingHorizontal: 11, borderWidth: 1, borderColor: colors.line, borderRadius: 8, backgroundColor: colors.surface, flexDirection: "row", alignItems: "center", gap: 8 },
  searchInput: { flex: 1, color: colors.ink, fontSize: 10 },
  loader: { marginVertical: 22 },
  peopleList: { marginHorizontal: 16, paddingHorizontal: 12, borderWidth: 1, borderColor: colors.line, borderRadius: 11, backgroundColor: colors.surface },
  sectionHeading: { marginTop: 25, marginBottom: 11, paddingHorizontal: 20, flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between" },
  eyebrow: { color: colors.muted, fontSize: 8, fontWeight: "800", letterSpacing: 1 },
  sectionTitle: { marginTop: 5, color: colors.ink, fontFamily: "Georgia", fontSize: 22, fontWeight: "500" },
  count: { color: colors.subtle, fontFamily: "System", fontSize: 9 },
  seeAllText: { color: colors.leaf, fontSize: 8, fontWeight: "700" },
  filterRow: { gap: 7, paddingHorizontal: 20, paddingBottom: 13 },
  activeFilter: { borderColor: colors.forest, backgroundColor: colors.forest },
  activeFilterText: { color: colors.surface },
  filter: { paddingHorizontal: 12, paddingVertical: 8, borderWidth: 1, borderColor: colors.line, borderRadius: 18, backgroundColor: colors.surface },
  filterText: { color: colors.muted, fontSize: 9, fontWeight: "600" },
  rideList: { gap: 12, paddingHorizontal: 16 },
  nearbySection: { marginTop: 26, paddingTop: 2, paddingBottom: 10 },
  nearbyDescription: { marginHorizontal: 20, marginBottom: 5, color: colors.muted, fontSize: 9 },
  personRow: { minHeight: 61, marginHorizontal: 20, borderBottomWidth: 1, borderBottomColor: colors.line, flexDirection: "row", alignItems: "center", gap: 10 },
  personAvatar: { width: 37, height: 37, borderRadius: 20, alignItems: "center", justifyContent: "center" },
  personInitials: { color: colors.surface, fontSize: 10, fontWeight: "800" },
  personInfo: { flex: 1, gap: 3 },
  personName: { color: colors.ink, fontSize: 10, fontWeight: "700" },
  personNote: { color: colors.muted, fontSize: 8 },
  addButton: { width: 29, height: 29, borderWidth: 1, borderColor: "#DCE5D7", borderRadius: 15, alignItems: "center", justifyContent: "center", backgroundColor: "#EFF3E8" },
  addedButton: { borderColor: colors.leaf, backgroundColor: colors.leaf },
  addButtonText: { color: colors.forest, fontSize: 17, lineHeight: 20 },
  mutualNote: { marginHorizontal: 20, marginTop: 12, padding: 11, borderRadius: 9, backgroundColor: "#E9EFE1", flexDirection: "row", alignItems: "center", gap: 8 },
  mutualText: { flex: 1, color: "#637769", fontSize: 8, lineHeight: 13 },
});