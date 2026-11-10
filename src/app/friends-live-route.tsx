import { useCallback, useEffect, useRef, useState } from "react";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { ArrowLeft, Compass, LocateFixed, Minus, Navigation, Plus, Route } from "lucide-react-native";
import { ActivityIndicator, Platform, Pressable, StyleSheet, Text, View } from "react-native";
import * as Location from "expo-location";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { UnifiedMapView } from "../components/UnifiedMapView";
import { NavigationGuidanceCard } from "../components/navigation-guidance-card";
import { colors } from "../components/theme";
import { useAuth } from "../components/auth-provider";
import { formatRideDistance, formatRideDuration } from "../lib/ride-format";
import { supabase } from "../lib/supabase";
import { LocationService } from "../services/location";
import { loadLiveFriendLocations, loadLiveRideMemberLocations, loadOwnLiveLocation } from "../services/location/live-tracking";
import { getNavigationCameraForSpeed, getNavigationGuidance } from "../services/location/navigation-guidance";
import { useForegroundNavigationLocation } from "../services/location/use-foreground-navigation-location";
import type { LiveFriendLocationData } from "../services/location/live-tracking";
import type { AppCoords, RouteResult } from "../services/location/types";

type LiveRouteSnapshot = {
  key: string;
  friend: LiveFriendLocationData | null;
  origin: AppCoords | null;
  error: string;
};

type RouteCalculation = { key: string; route: RouteResult } | { key: string; error: string };
type CameraAction = "center" | "zoom-in" | "zoom-out" | "overview" | "north";

function updatedLabel(updatedAt: string) {
  const minutes = Math.max(0, Math.floor((Date.now() - new Date(updatedAt).getTime()) / 60_000));
  if (minutes === 0) return "Updated just now";
  if (minutes === 1) return "Updated 1 minute ago";
  return `Updated ${minutes} minutes ago`;
}

async function getDeviceLocation(): Promise<AppCoords> {
  const permission = await Location.requestForegroundPermissionsAsync();
  if (!permission.granted) {
    throw new Error("Allow location access to calculate a route from your current location.");
  }
  if (!await Location.hasServicesEnabledAsync()) {
    throw new Error("Turn on device location services to calculate a route.");
  }
  const location = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
  return { lat: location.coords.latitude, lng: location.coords.longitude };
}

export default function FriendsLiveRouteScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { friendId: param, rideId: rideParam } = useLocalSearchParams<{ friendId: string; rideId?: string }>();
  const { ready, userId } = useAuth();
  const friendId = typeof param === "string" ? param : null;
  const rideId = typeof rideParam === "string" ? rideParam : null;
  const requestKey = `${userId ?? ""}:${friendId ?? ""}:${rideId ?? ""}`;
  const [snapshot, setSnapshot] = useState<LiveRouteSnapshot | null>(null);
  const [refreshError, setRefreshError] = useState<{ key: string; message: string } | null>(null);
  const [realtimeConnected, setRealtimeConnected] = useState(false);
  const [retryCount, setRetryCount] = useState(0);
  const [routeCalculation, setRouteCalculation] = useState<RouteCalculation | null>(null);
  const [cameraCommand, setCameraCommand] = useState<{ id: number; action: CameraAction; target?: AppCoords; bearing?: number; zoom?: number; pitch?: number } | null>(null);
  const cameraCommandId = useRef(0);
  const retryLocationRef = useRef<(() => void) | null>(null);
  const onNavigationLocation = useCallback((location: AppCoords, bearing: number | null, speed: number | null) => {
    setCameraCommand({ id: ++cameraCommandId.current, action: "center", target: location, ...getNavigationCameraForSpeed(speed), ...(bearing !== null ? { bearing } : {}) });
  }, []);
  const { location: navigationLocation, error: navigationLocationError } = useForegroundNavigationLocation(
    Boolean(ready && userId && friendId),
    onNavigationLocation,
  );

  useFocusEffect(useCallback(() => {
    if (!ready || !userId || !friendId) return;

    let active = true;
    let refreshing = false;
    let originAttempted = false;
    let deviceOrigin: AppCoords | null = null;
    let originError = "";

    async function refreshLocation() {
      if (!active || refreshing) return;
      refreshing = true;
      try {
        const [friends, liveOrigin] = await Promise.all([
          rideId ? loadLiveRideMemberLocations(rideId) : loadLiveFriendLocations(userId),
          loadOwnLiveLocation(userId),
        ]);
        if (!active) return;

        const friend = friends.find((item) => item.userId === friendId) ?? null;
        let origin = liveOrigin ?? deviceOrigin;
        if (friend && !origin && !originAttempted) {
          originAttempted = true;
          try {
            origin = await getDeviceLocation();
            deviceOrigin = origin;
          } catch (cause) {
            originError = cause instanceof Error ? cause.message : "Your current location is unavailable.";
          }
          if (!active) return;
        }

        setSnapshot({
          key: requestKey,
          friend,
          origin,
          error: friend && !origin ? originError || "Your current location is unavailable." : "",
        });
        setRefreshError(null);
      } catch (cause) {
        if (active) {
          setRefreshError({
            key: requestKey,
            message: cause instanceof Error ? cause.message : "Could not refresh the friend’s live location.",
          });
        }
      } finally {
        refreshing = false;
      }
    }

    retryLocationRef.current = () => {
      originAttempted = false;
      originError = "";
      void refreshLocation();
    };
    void refreshLocation();
    const interval = setInterval(() => { void refreshLocation(); }, 15_000);
    const channel = supabase.channel(`friend-live-route:${userId}:${friendId}:${rideId ?? "friends"}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "live_locations" }, () => { void refreshLocation(); })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "live_locations" }, () => { void refreshLocation(); })
      .on("postgres_changes", { event: "DELETE", schema: "public", table: "live_locations" }, () => { void refreshLocation(); })
      .subscribe((status) => {
        if (!active) return;
        setRealtimeConnected(status === "SUBSCRIBED");
        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          console.warn("[location] Friend route subscription unavailable; periodic refresh remains active.");
        }
      });

    return () => {
      active = false;
      clearInterval(interval);
      retryLocationRef.current = null;
      setRealtimeConnected(false);
      void supabase.removeChannel(channel);
    };
  }, [friendId, ready, requestKey, rideId, userId]));

  const currentSnapshot = snapshot?.key === requestKey ? snapshot : null;
  const friend = currentSnapshot?.friend ?? null;
  const origin = currentSnapshot?.origin ?? null;
  const startLat = origin?.lat ?? null;
  const startLng = origin?.lng ?? null;
  const endLat = friend?.location.lat ?? null;
  const endLng = friend?.location.lng ?? null;
  const routePositionKey = startLat !== null && startLng !== null && endLat !== null && endLng !== null
    ? `${requestKey}:${startLat},${startLng}:${endLat},${endLng}`
    : null;
  const routeRequestKey = routePositionKey ? `${routePositionKey}:${retryCount}` : null;

  useEffect(() => {
    if (!ready || !routeRequestKey || startLat === null || startLng === null || endLat === null || endLng === null) return;

    let active = true;
    void LocationService.getRoute({ lat: startLat, lng: startLng }, { lat: endLat, lng: endLng })
      .then((route) => { if (active) setRouteCalculation({ key: routeRequestKey, route }); })
      .catch((cause: unknown) => {
        if (active) setRouteCalculation({
          key: routeRequestKey,
          error: cause instanceof Error ? cause.message : "Could not calculate a route to your friend.",
        });
      });
    return () => { active = false; };
  }, [endLat, endLng, ready, routeRequestKey, startLat, startLng]);

  const route = routeCalculation?.key === routeRequestKey && "route" in routeCalculation
    ? routeCalculation.route
    : null;
  const currentNavigationLocation = navigationLocation ?? origin;
  const navigationGuidance = route && currentNavigationLocation
    ? getNavigationGuidance(route, currentNavigationLocation)
    : null;
  const routeError = routeCalculation?.key === routeRequestKey && "error" in routeCalculation
    ? routeCalculation.error
    : "";
  const routeLoading = Boolean(routeRequestKey && routeCalculation?.key !== routeRequestKey);
  const currentRefreshError = refreshError?.key === requestKey ? refreshError.message : "";
  const loading = !ready || (Boolean(userId && friendId) && !currentSnapshot && !currentRefreshError);
  const screenError = ready && (!userId || !friendId)
    ? "This live route is unavailable."
    : !currentSnapshot
      ? currentRefreshError
      : !friend
        ? rideId
          ? "This rider’s live location is unavailable on the ride."
          : "Your friend’s live location is unavailable. They may have turned off sharing."
        : "";
  const sendCameraCommand = (action: CameraAction) => {
    setCameraCommand({ id: ++cameraCommandId.current, action });
  };

  return <View style={styles.screen}>
    <UnifiedMapView
      userLocation={null}
      currentLocation={navigationLocation ?? origin}
      currentLocationTitle="You"
      destinationLocation={friend?.location ?? null}
      routePoints={route?.points ?? []}
      routeProgress={navigationGuidance?.progressRatio ?? null}
      fitToMarkers
      showUserLocationTitle
      userLocationTitle="You"
      destinationTitle={friend?.name ?? "Friend"}
      cameraCommand={cameraCommand}
      style={styles.map}
    />
    <View style={[styles.topbar, { paddingTop: insets.top + 6 }]}>
      <View style={styles.topbarGroup}>
        <Pressable accessibilityRole="button" accessibilityLabel={rideId ? "Back to ride map" : "Back to friends map"} onPress={() => router.back()} style={styles.backButton}>
          <ArrowLeft color={colors.ink} size={19} />
        </Pressable>
        <View style={styles.topbarCopy}>
          <Text style={styles.eyebrow}>{rideId ? "RIDE MEMBER ROUTE" : "LIVE ROUTE"}</Text>
          <Text numberOfLines={1} style={styles.topbarTitle}>{friend?.name ?? "Route to friend"}</Text>
        </View>
      </View>
      <Text style={[styles.connection, realtimeConnected && styles.connected]}>{realtimeConnected ? "LIVE" : "SYNCING"}</Text>
    </View>
    <NavigationGuidanceCard
      guidance={navigationGuidance}
      style={[styles.navigationGuidance, { top: insets.top + 58 }]}
    />
    {Platform.OS !== "web" && <View style={[styles.mapControls, { top: insets.top + 58 }]}>
      <Pressable accessibilityRole="button" accessibilityLabel="Center on current location" disabled={!origin} onPress={() => sendCameraCommand("center")} style={[styles.mapControl, !origin && styles.mapControlDisabled]}>
        <LocateFixed color={colors.forest} size={19} />
      </Pressable>
      <Pressable accessibilityRole="button" accessibilityLabel="Show full route" disabled={!origin || !friend} onPress={() => sendCameraCommand("overview")} style={[styles.mapControl, (!origin || !friend) && styles.mapControlDisabled]}>
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
    {(loading || screenError) && <View style={styles.messageCard}>
      {loading
        ? <ActivityIndicator color={colors.leaf} />
        : <Text accessibilityRole="alert" style={styles.error}>{screenError}</Text>}
    </View>}
    {friend && <View style={[styles.routeCard, { paddingBottom: Math.max(14, insets.bottom + 10) }]}>
      <View style={styles.friendHeading}>
        <LocateFixed color={colors.leaf} size={16} />
        <View style={styles.friendCopy}>
          <Text numberOfLines={1} style={styles.friendName}>{friend.name}</Text>
          <Text style={styles.updated}>{updatedLabel(friend.updatedAt)}</Text>
        </View>
      </View>
      {origin && (routeLoading
        ? <View style={styles.routeStatus}><ActivityIndicator color={colors.leaf} size="small" /><Text style={styles.routeStatusText}>Updating route…</Text></View>
        : route
          ? <View style={styles.metrics}>
            <Text style={styles.metric}>{formatRideDistance(navigationGuidance ? navigationGuidance.remainingDistanceMeters / 1000 : route.distanceKilometers)}</Text>
            <Text style={styles.metric}>{formatRideDuration(navigationGuidance ? navigationGuidance.remainingDurationMinutes : route.estimatedDurationMinutes)}</Text>
          </View>
          : routeError
            ? <View style={styles.routeErrorRow}>
              <Text style={styles.routeError}>{routeError}</Text>
              <Pressable accessibilityRole="button" onPress={() => setRetryCount((count) => count + 1)} style={styles.retryButton}>
                <Text style={styles.retryText}>Retry</Text>
              </Pressable>
            </View>
            : null)}
      {currentSnapshot?.error ? <View style={styles.routeErrorRow}>
        <Text style={styles.routeError}>{currentSnapshot.error}</Text>
        <Pressable accessibilityRole="button" onPress={() => retryLocationRef.current?.()} style={styles.retryButton}>
          <Text style={styles.retryText}>Retry</Text>
        </Pressable>
      </View> : null}
      {currentRefreshError ? <Text style={styles.routeError}>{currentRefreshError}</Text> : null}
      {!!navigationLocationError && <Text accessibilityRole="alert" style={styles.routeError}>{navigationLocationError}</Text>}
      {route && <View style={styles.routeLabel}>
        <Navigation color={colors.forest} size={14} />
        <Text style={styles.routeLabelText}>Route updates with their live location.</Text>
      </View>}
    </View>}
  </View>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, overflow: "hidden", backgroundColor: colors.paper },
  map: { flex: 1, height: undefined, minHeight: 0, padding: 0, borderRadius: 0 },
  topbar: { position: "absolute", top: 0, left: 0, right: 0, paddingHorizontal: 16, flexDirection: "row", alignItems: "center", gap: 10 },
  navigationGuidance: { position: "absolute", left: 14, right: 70 },
  topbarGroup: { flexDirection: "row", alignItems: "center", gap: 10, paddingRight: 12, borderRadius: 10, backgroundColor: colors.surface, flexShrink: 1 },
  backButton: { width: 36, height: 36, alignItems: "center", justifyContent: "center", borderRadius: 10, backgroundColor: "transparent" },
  topbarCopy: { gap: 2, flexShrink: 1 },
  eyebrow: { color: colors.muted, fontSize: 7, fontWeight: "800", letterSpacing: 0.8 },
  topbarTitle: { color: colors.ink, fontSize: 15, fontWeight: "800" },
  connection: { color: colors.muted, fontSize: 8, fontWeight: "800", letterSpacing: 0.5 },
  connected: { color: colors.leaf },
  mapControls: { position: "absolute", right: 12, padding: 4, alignItems: "center", gap: 3, borderWidth: 1, borderColor: colors.line, borderRadius: 13, backgroundColor: colors.surface, shadowColor: "#000000", shadowOpacity: 0.14, shadowRadius: 8, elevation: 4 },
  mapControl: { width: 40, height: 40, alignItems: "center", justifyContent: "center", borderRadius: 9 },
  mapControlDisabled: { opacity: 0.4 },
  controlDivider: { width: 24, height: 1, marginVertical: 2, backgroundColor: colors.line },
  messageCard: { position: "absolute", top: 78, left: 16, right: 16, padding: 14, alignItems: "center", borderRadius: 10, backgroundColor: colors.surface },
  error: { color: "#9B493C", fontSize: 10, lineHeight: 15, textAlign: "center" },
  routeCard: { position: "absolute", left: 14, right: 14, bottom: 10, padding: 15, borderWidth: 1, borderColor: colors.line, borderRadius: 16, backgroundColor: colors.surface, shadowColor: "#000000", shadowOpacity: 0.13, shadowRadius: 12, elevation: 5 },
  friendHeading: { flexDirection: "row", alignItems: "center", gap: 9 },
  friendCopy: { flex: 1, gap: 3 },
  friendName: { color: colors.ink, fontSize: 12, fontWeight: "800" },
  updated: { color: colors.muted, fontSize: 8 },
  metrics: { marginTop: 10, flexDirection: "row", gap: 14 },
  metric: { color: colors.forest, fontSize: 9, fontWeight: "700" },
  routeStatus: { marginTop: 10, flexDirection: "row", alignItems: "center", gap: 8 },
  routeStatusText: { color: colors.muted, fontSize: 9 },
  routeErrorRow: { marginTop: 9, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
  routeError: { flex: 1, marginTop: 8, color: "#9B493C", fontSize: 9, lineHeight: 14 },
  retryButton: { minHeight: 34, justifyContent: "center", paddingHorizontal: 12, borderRadius: 8, backgroundColor: colors.paleGreen },
  retryText: { color: colors.forest, fontSize: 9, fontWeight: "800" },
  routeLabel: { marginTop: 10, flexDirection: "row", alignItems: "center", gap: 7 },
  routeLabelText: { color: colors.forest, fontSize: 8, fontWeight: "700" },
});
