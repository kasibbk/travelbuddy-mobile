import { useCallback, useEffect, useRef, useState } from "react";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { ArrowLeft, Compass, FileText, LocateFixed, Minus, Navigation, Plus, Route, Users, X } from "lucide-react-native";
import { ActivityIndicator, Modal, Platform, Pressable, StyleSheet, Text, View } from "react-native";
import * as Location from "expo-location";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { UnifiedMapView } from "../../../components/UnifiedMapView";
import { NavigationGuidanceCard } from "../../../components/navigation-guidance-card";
import { colors } from "../../../components/theme";
import { useAuth } from "../../../components/auth-provider";
import type { RideCardData } from "../../../lib/app-data";
import { formatRideDistance, formatRideDuration } from "../../../lib/ride-format";
import { supabase } from "../../../lib/supabase";
import { loadRideRoute } from "../../../services/location/ride-route";
import { getNavigationCameraForSpeed, getNavigationGuidance } from "../../../services/location/navigation-guidance";
import { loadLiveRideMemberLocations } from "../../../services/location/live-tracking";
import { useForegroundNavigationLocation } from "../../../services/location/use-foreground-navigation-location";
import type { LiveFriendLocationData } from "../../../services/location/live-tracking";
import type { LoadedRideRoute } from "../../../services/location/ride-route";
import type { AppCoords } from "../../../services/location/types";

type CameraAction = "center" | "zoom-in" | "zoom-out" | "overview" | "north";

export default function RideMapScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { id, source } = useLocalSearchParams<{ id: string; source?: string }>();
  const { ready, userId } = useAuth();
  const rideId = typeof id === "string" ? id : null;
  const enteredFromActiveRideBanner = source === "active-ride-banner";
  const requestKey = `${userId ?? ""}:${rideId ?? ""}`;
  const [result, setResult] = useState<
    { key: string; route: LoadedRideRoute } | { key: string; error: string } | null
  >(null);
  const [rideStatus, setRideStatus] = useState<RideCardData["status"]>("open");
  const [memberLocations, setMemberLocations] = useState<LiveFriendLocationData[]>([]);
  const [memberError, setMemberError] = useState("");
  const [selectedMemberId, setSelectedMemberId] = useState<string | null>(null);
  const [friendListOpen, setFriendListOpen] = useState(false);
  const [cameraCommand, setCameraCommand] = useState<{ id: number; action: CameraAction; target?: AppCoords; bearing?: number; zoom?: number; pitch?: number } | null>(null);
  const [cameraError, setCameraError] = useState("");
  const [centering, setCentering] = useState(false);
  const cameraCommandId = useRef(0);
  const onNavigationLocation = useCallback((location: AppCoords, bearing: number | null, speed: number | null) => {
    setCameraCommand({ id: ++cameraCommandId.current, action: "center", target: location, ...getNavigationCameraForSpeed(speed), ...(bearing !== null ? { bearing } : {}) });
  }, []);
  const { location: navigationLocation, error: navigationLocationError } = useForegroundNavigationLocation(
    Boolean(ready && userId && rideId && rideStatus === "started"),
    onNavigationLocation,
  );

  useEffect(() => {
    if (!ready || !userId || !rideId) return;

    let active = true;
    void loadRideRoute(rideId, userId)
      .then((route) => {
        if (active) {
          setResult({ key: requestKey, route });
          setRideStatus(route.ride.status);
        }
      })
      .catch((cause: unknown) => {
        if (active) setResult({
          key: requestKey,
          error: cause instanceof Error ? cause.message : "Could not load the ride map.",
        });
      });
    return () => { active = false; };
  }, [ready, requestKey, rideId, userId]);

  useFocusEffect(useCallback(() => {
    if (!ready || !userId || !rideId) return;

    let active = true;
    let refreshing = false;
    async function refreshLiveMembers() {
      if (!active || refreshing) return;
      refreshing = true;
      try {
        const { data: rideRow, error: rideError } = await supabase.from("rides")
          .select("status")
          .eq("id", rideId)
          .maybeSingle();
        if (rideError) throw rideError;
        if (!rideRow) throw new Error("This ride is unavailable.");
        const status = rideRow.status as RideCardData["status"];
        if (!active) return;
        setRideStatus(status);
        if (status !== "started") {
          setMemberLocations([]);
          setMemberError("");
          return;
        }
        const locations = await loadLiveRideMemberLocations(rideId);
        if (active) {
          setMemberLocations(locations);
          setMemberError("");
        }
      } catch (cause) {
        if (active) {
          setMemberLocations([]);
          setMemberError(cause instanceof Error ? cause.message : "Could not load live ride locations.");
        }
      } finally {
        refreshing = false;
      }
    }

    void refreshLiveMembers();
    const interval = setInterval(() => { void refreshLiveMembers(); }, 15_000);
    const channel = supabase.channel(`ride-live-locations:${rideId}:${userId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "live_locations" }, () => { void refreshLiveMembers(); })
      .subscribe((status) => {
        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          console.warn("[location] Ride member subscription unavailable; periodic refresh remains active.");
        }
      });

    return () => {
      active = false;
      clearInterval(interval);
      void supabase.removeChannel(channel);
    };
  }, [ready, rideId, userId]));

  const currentResult = result?.key === requestKey ? result : null;
  const route = currentResult && "route" in currentResult ? currentResult.route : null;
  const navigationGuidance = route && rideStatus === "started" && navigationLocation
    ? getNavigationGuidance(route, navigationLocation)
    : null;
  const selectedMember = memberLocations.find((member) => member.userId === selectedMemberId) ?? null;
  const rideFriends = memberLocations.filter((member) => member.userId !== userId);
  const friendMarkers = memberLocations
    .filter((member) => member.userId !== userId || !navigationLocation)
    .map((member) => ({
    id: member.userId,
    location: member.location,
    title: member.name,
  }));
  const loading = !ready || (Boolean(userId && rideId) && !currentResult);
  const error = ready && (!userId || !rideId)
    ? "This ride map is unavailable."
    : currentResult && "error" in currentResult ? currentResult.error : "";

  function sendCameraCommand(action: CameraAction, target?: AppCoords) {
    setCameraCommand({ id: ++cameraCommandId.current, action, ...(target ? { target } : {}) });
  }

  async function centerOnCurrentLocation() {
    if (centering) return;
    setCentering(true);
    setCameraError("");
    try {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (!permission.granted) throw new Error("Allow location access to center the map on your current location.");
      if (!await Location.hasServicesEnabledAsync()) throw new Error("Turn on device location services to center the map.");
      const location = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      sendCameraCommand("center", { lat: location.coords.latitude, lng: location.coords.longitude });
    } catch (cause) {
      setCameraError(cause instanceof Error ? cause.message : "Could not read your current location.");
    } finally {
      setCentering(false);
    }
  }

  return <View style={styles.screen}>
    {route && <UnifiedMapView
      userLocation={route.start}
      currentLocation={rideStatus === "started" ? navigationLocation : null}
      currentLocationTitle="You"
      destinationLocation={route.destination}
      routePoints={route.points}
      routeProgress={rideStatus === "started" ? navigationGuidance?.progressRatio ?? null : null}
      friendMarkers={friendMarkers}
      fitToMarkers
      userLocationTitle="Starting point"
      destinationTitle="Destination"
      cameraCommand={cameraCommand}
      onFriendMarkerPress={(memberId) => { if (memberId !== userId) setSelectedMemberId(memberId); }}
      style={styles.map}
    />}
    <View style={[styles.topOverlay, { paddingTop: Math.max(6, insets.top + 6) }]}>
      <View style={styles.topbarGroup}>
        <Pressable accessibilityRole="button" accessibilityLabel="Back" onPress={() => router.back()} style={styles.backButton}>
          <ArrowLeft color={colors.ink} size={19} />
        </Pressable>
        <View style={styles.topbarCopy}>
          <Text style={styles.eyebrow}>{rideStatus === "started" ? "LIVE RIDER MAP" : "RIDE ROUTE"}</Text>
          <Text numberOfLines={1} style={styles.topTitle}>{route?.ride.title ?? "Ride route"}</Text>
        </View>
      </View>
    </View>
    {rideStatus === "started" && <NavigationGuidanceCard
      guidance={navigationGuidance}
      style={[styles.navigationGuidance, { top: insets.top + 58 }]}
    />}
    {route && Platform.OS !== "web" && <View style={[styles.mapControls, { top: insets.top + 58 }]}>
      {rideStatus !== "completed" && <Pressable accessibilityRole="button" accessibilityLabel="Center on current location" disabled={centering} onPress={() => { void centerOnCurrentLocation(); }} style={[styles.mapControl, centering && styles.mapControlDisabled]}>
        {centering ? <ActivityIndicator size="small" color={colors.forest} /> : <LocateFixed color={colors.forest} size={19} />}
      </Pressable>}
      <Pressable accessibilityRole="button" accessibilityLabel="Show full route and riders" onPress={() => sendCameraCommand("overview")} style={styles.mapControl}>
        <Route color={colors.forest} size={19} />
      </Pressable>
      <View style={styles.controlDivider} />
      <Pressable accessibilityRole="button" accessibilityLabel="Zoom in" onPress={() => sendCameraCommand("zoom-in")} style={styles.mapControl}>
        <Plus color={colors.forest} size={20} />
      </Pressable>
      <Pressable accessibilityRole="button" accessibilityLabel="Zoom out" onPress={() => sendCameraCommand("zoom-out")} style={styles.mapControl}>
        <Minus color={colors.forest} size={20} />
      </Pressable>
      <View style={styles.controlDivider} />
      <Pressable accessibilityRole="button" accessibilityLabel="Reset map orientation" onPress={() => sendCameraCommand("north")} style={styles.mapControl}>
        <Compass color={colors.forest} size={19} />
      </Pressable>
    </View>}
    {(loading || error) && <View style={styles.messageCard}>
      {loading ? <ActivityIndicator color={colors.leaf} /> : <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
    </View>}
    {route && <View style={[styles.routeCard, { paddingBottom: Math.max(14, insets.bottom + 10) }]}>
      <Text numberOfLines={1} style={styles.routeName}>{route.ride.route}</Text>
      {rideStatus === "started" && <Text style={styles.memberSummary}>{memberLocations.length} rider{memberLocations.length === 1 ? "" : "s"} sharing live location</Text>}
      {enteredFromActiveRideBanner && rideStatus === "started" && <Pressable accessibilityRole="button" onPress={() => router.push({ pathname: "/rides/[id]", params: { id: route.ride.id } })} style={styles.detailsButton}>
        <FileText color={colors.forest} size={15} />
        <Text style={styles.friendsButtonText}>Ride details</Text>
      </Pressable>}
      {!!memberError && <Text accessibilityRole="alert" style={styles.memberError}>{memberError}</Text>}
      {!!cameraError && <Text accessibilityRole="alert" style={styles.memberError}>{cameraError}</Text>}
      {!!navigationLocationError && <Text accessibilityRole="alert" style={styles.memberError}>{navigationLocationError}</Text>}
      <View style={styles.metrics}>
        <Text style={styles.metric}>{formatRideDistance(navigationGuidance ? navigationGuidance.remainingDistanceMeters / 1000 : route.distanceKilometers)}</Text>
        <Text style={styles.metric}>{formatRideDuration(navigationGuidance ? navigationGuidance.remainingDurationMinutes : route.estimatedDurationMinutes)}</Text>
      </View>
      <Pressable accessibilityRole="button" onPress={() => router.push({ pathname: "/rides/[id]/directions", params: { id: route.ride.id } })} style={styles.directionsButton}>
        <Navigation color={colors.surface} size={16} />
        <Text style={styles.directionsButtonText}>Turn-by-turn directions</Text>
      </Pressable>
      {rideStatus === "started" && <Pressable accessibilityRole="button" onPress={() => setFriendListOpen(true)} style={styles.friendsButton}>
        <Users color={colors.forest} size={15} />
        <Text style={styles.friendsButtonText}>Route to a friend</Text>
      </Pressable>}
    </View>}
    <Modal transparent visible={friendListOpen} animationType="fade" onRequestClose={() => setFriendListOpen(false)}>
      <View style={styles.modalBackdrop}>
        <View style={styles.memberPanel}>
          <Pressable accessibilityRole="button" accessibilityLabel="Close ride member list" onPress={() => setFriendListOpen(false)} style={styles.modalClose}><X color={colors.muted} size={19} /></Pressable>
          <Text style={styles.memberName}>Riders sharing location</Text>
          <Text style={styles.memberUpdated}>Choose someone on this ride to follow.</Text>
          {rideFriends.length
            ? <View style={styles.rideFriendList}>
              {rideFriends.map((member) => <Pressable
                key={member.userId}
                accessibilityRole="button"
                accessibilityLabel={`Route to ${member.name}`}
                onPress={() => {
                  if (!rideId) return;
                  setFriendListOpen(false);
                  router.push({ pathname: "/friends-live-route", params: { friendId: member.userId, rideId } });
                }}
                style={styles.rideFriendRow}
              >
                <View style={styles.rideFriendIcon}><Users color={colors.forest} size={16} /></View>
                <View style={styles.rideFriendCopy}>
                  <Text numberOfLines={1} style={styles.rideFriendName}>{member.name}</Text>
                  <Text style={styles.memberUpdated}>Live location available</Text>
                </View>
                <Navigation color={colors.forest} size={16} />
              </Pressable>)}
            </View>
            : <Text style={styles.noRideFriends}>No other riders are sharing a live location right now.</Text>}
        </View>
      </View>
    </Modal>
    <Modal transparent visible={!!selectedMember && selectedMember.userId !== userId} animationType="fade" onRequestClose={() => setSelectedMemberId(null)}>
      <View style={styles.modalBackdrop}>
        <View style={styles.memberPanel}>
          <Pressable accessibilityRole="button" accessibilityLabel="Close" onPress={() => setSelectedMemberId(null)} style={styles.modalClose}><X color={colors.muted} size={19} /></Pressable>
          <Text style={styles.memberName}>{selectedMember?.name}</Text>
          <Text style={styles.memberUpdated}>Live location on this ride</Text>
          <Pressable accessibilityRole="button" onPress={() => {
            if (!selectedMember || !rideId) return;
            router.push({ pathname: "/friends-live-route", params: { friendId: selectedMember.userId, rideId } });
            setSelectedMemberId(null);
          }} style={styles.directionsButton}>
            <Navigation color={colors.surface} size={15} />
            <Text style={styles.directionsButtonText}>Follow live location</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  </View>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, overflow: "hidden", backgroundColor: colors.paper },
  map: { flex: 1, height: undefined, minHeight: 0, padding: 0, borderRadius: 0 },
  topOverlay: { position: "absolute", top: 0, left: 0, right: 0, paddingHorizontal: 16, flexDirection: "row", alignItems: "center", gap: 10 },
  navigationGuidance: { position: "absolute", left: 14, right: 70 },
  topbarGroup: { flexDirection: "row", alignItems: "center", gap: 10, paddingRight: 12, borderRadius: 10, backgroundColor: colors.surface, flexShrink: 1 },
  backButton: { width: 36, height: 36, alignItems: "center", justifyContent: "center", borderRadius: 10, backgroundColor: "transparent" },
  topbarCopy: { gap: 2, flexShrink: 1 },
  eyebrow: { color: colors.muted, fontSize: 7, fontWeight: "800", letterSpacing: 0.8 },
  topTitle: { color: colors.ink, fontSize: 15, fontWeight: "800" },
  messageCard: { position: "absolute", top: 70, left: 16, right: 16, padding: 14, alignItems: "center", borderRadius: 10, backgroundColor: colors.surface },
  error: { color: "#9B493C", fontSize: 10, textAlign: "center" },
  mapControls: { position: "absolute", right: 12, padding: 4, alignItems: "center", gap: 3, borderWidth: 1, borderColor: colors.line, borderRadius: 13, backgroundColor: colors.surface, shadowColor: "#000000", shadowOpacity: 0.14, shadowRadius: 8, elevation: 4 },
  mapControl: { width: 40, height: 40, alignItems: "center", justifyContent: "center", borderRadius: 9 },
  mapControlDisabled: { opacity: 0.55 },
  controlDivider: { width: 24, height: 1, marginVertical: 2, backgroundColor: colors.line },
  routeCard: { position: "absolute", left: 14, right: 14, bottom: 10, padding: 15, borderRadius: 16, backgroundColor: colors.surface, shadowColor: "#000000", shadowOpacity: 0.13, shadowRadius: 12, elevation: 5 },
  routeName: { color: colors.ink, fontSize: 12, fontWeight: "800" },
  memberSummary: { marginTop: 4, color: colors.leaf, fontSize: 8, fontWeight: "700" },
  memberError: { marginTop: 6, color: "#9B493C", fontSize: 8, lineHeight: 12 },
  metrics: { marginTop: 7, flexDirection: "row", gap: 14 },
  metric: { color: colors.muted, fontSize: 9, fontWeight: "700" },
  directionsButton: { minHeight: 44, marginTop: 12, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, borderRadius: 10, backgroundColor: colors.forest },
  directionsButtonText: { color: colors.surface, fontSize: 10, fontWeight: "800" },
  friendsButton: { minHeight: 40, marginTop: 8, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 7, borderWidth: 1, borderColor: colors.line, borderRadius: 10, backgroundColor: colors.surface },
  detailsButton: { minHeight: 40, marginTop: 10, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 7, borderWidth: 1, borderColor: colors.line, borderRadius: 10, backgroundColor: colors.surface },
  friendsButtonText: { color: colors.forest, fontSize: 9, fontWeight: "800" },
  modalBackdrop: { flex: 1, padding: 20, justifyContent: "flex-end", backgroundColor: "#13251F66" },
  memberPanel: { padding: 17, borderRadius: 14, backgroundColor: colors.surface },
  modalClose: { width: 30, height: 30, alignSelf: "flex-end", alignItems: "center", justifyContent: "center" },
  rideFriendList: { marginTop: 12, borderTopWidth: 1, borderTopColor: colors.line },
  rideFriendRow: { minHeight: 58, flexDirection: "row", alignItems: "center", gap: 10, borderBottomWidth: 1, borderBottomColor: colors.line },
  rideFriendIcon: { width: 34, height: 34, alignItems: "center", justifyContent: "center", borderRadius: 17, backgroundColor: colors.paleGreen },
  rideFriendCopy: { flex: 1, gap: 3 },
  rideFriendName: { color: colors.ink, fontSize: 10, fontWeight: "800" },
  noRideFriends: { marginTop: 14, color: colors.muted, fontSize: 10, lineHeight: 15 },
  memberName: { color: colors.ink, fontSize: 16, fontWeight: "800" },
  memberUpdated: { marginTop: 4, color: colors.muted, fontSize: 9 },
});
