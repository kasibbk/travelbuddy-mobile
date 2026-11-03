import { useEffect, useState } from "react";
import { useLocalSearchParams, useRouter } from "expo-router";
import { ArrowLeft, Navigation } from "lucide-react-native";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { UnifiedMapView } from "../../../components/UnifiedMapView";
import { colors } from "../../../components/theme";
import { useAuth } from "../../../components/auth-provider";
import { formatRideDistance, formatRideDuration } from "../../../lib/ride-format";
import { loadRideRoute } from "../../../services/location/ride-route";
import type { LoadedRideRoute } from "../../../services/location/ride-route";

export default function RideMapScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { ready, userId } = useAuth();
  const rideId = typeof id === "string" ? id : null;
  const requestKey = `${userId ?? ""}:${rideId ?? ""}`;
  const [result, setResult] = useState<
    { key: string; route: LoadedRideRoute } | { key: string; error: string } | null
  >(null);

  useEffect(() => {
    if (!ready || !userId || !rideId) return;

    let active = true;
    void loadRideRoute(rideId, userId)
      .then((route) => { if (active) setResult({ key: requestKey, route }); })
      .catch((cause: unknown) => {
        if (active) setResult({
          key: requestKey,
          error: cause instanceof Error ? cause.message : "Could not load the ride map.",
        });
      });
    return () => { active = false; };
  }, [ready, requestKey, rideId, userId]);

  const currentResult = result?.key === requestKey ? result : null;
  const route = currentResult && "route" in currentResult ? currentResult.route : null;
  const loading = !ready || (Boolean(userId && rideId) && !currentResult);
  const error = ready && (!userId || !rideId)
    ? "This ride map is unavailable."
    : currentResult && "error" in currentResult ? currentResult.error : "";

  return <View style={styles.screen}>
    {route && <UnifiedMapView
      userLocation={route.start}
      destinationLocation={route.destination}
      routePoints={route.points}
      fitToMarkers
      userLocationTitle="Starting point"
      destinationTitle="Destination"
      style={styles.map}
    />}
    <View style={[styles.topOverlay, { paddingTop: Math.max(6, insets.top + 6) }]}>
      <Pressable accessibilityRole="button" accessibilityLabel="Back" onPress={() => router.back()} style={styles.backButton}>
        <ArrowLeft color={colors.ink} size={19} />
      </Pressable>
      <View style={styles.topbarCopy}>
        <Text style={styles.eyebrow}>RIDE ROUTE</Text>
        <Text numberOfLines={1} style={styles.topTitle}>{route?.ride.title ?? "Ride route"}</Text>
      </View>
    </View>
    {(loading || error) && <View style={styles.messageCard}>
      {loading ? <ActivityIndicator color={colors.leaf} /> : <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
    </View>}
    {route && <View style={[styles.routeCard, { paddingBottom: Math.max(14, insets.bottom + 10) }]}>
      <Text numberOfLines={1} style={styles.routeName}>{route.ride.route}</Text>
      <View style={styles.metrics}>
        <Text style={styles.metric}>{formatRideDistance(route.distanceKilometers)}</Text>
        <Text style={styles.metric}>{formatRideDuration(route.estimatedDurationMinutes)}</Text>
      </View>
      <Pressable accessibilityRole="button" onPress={() => router.push({ pathname: "/rides/[id]/directions", params: { id: route.ride.id } })} style={styles.directionsButton}>
        <Navigation color={colors.surface} size={16} />
        <Text style={styles.directionsButtonText}>Turn-by-turn directions</Text>
      </Pressable>
    </View>}
  </View>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, overflow: "hidden", backgroundColor: colors.paper },
  map: { flex: 1, height: undefined, minHeight: 0, padding: 0, borderRadius: 0 },
  topOverlay: { position: "absolute", top: 0, left: 0, right: 0, paddingHorizontal: 16, flexDirection: "row", alignItems: "center", gap: 10 },
  backButton: { width: 36, height: 36, alignItems: "center", justifyContent: "center", borderRadius: 10, backgroundColor: colors.surface },
  topbarCopy: { flex: 1, gap: 2 },
  eyebrow: { color: colors.muted, fontSize: 7, fontWeight: "800", letterSpacing: 0.8 },
  topTitle: { color: colors.ink, fontSize: 15, fontWeight: "800" },
  messageCard: { position: "absolute", top: 70, left: 16, right: 16, padding: 14, alignItems: "center", borderRadius: 10, backgroundColor: colors.surface },
  error: { color: "#9B493C", fontSize: 10, textAlign: "center" },
  routeCard: { position: "absolute", left: 14, right: 14, bottom: 10, padding: 15, borderRadius: 16, backgroundColor: colors.surface, shadowColor: "#000000", shadowOpacity: 0.13, shadowRadius: 12, elevation: 5 },
  routeName: { color: colors.ink, fontSize: 12, fontWeight: "800" },
  metrics: { marginTop: 7, flexDirection: "row", gap: 14 },
  metric: { color: colors.muted, fontSize: 9, fontWeight: "700" },
  directionsButton: { minHeight: 44, marginTop: 12, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, borderRadius: 10, backgroundColor: colors.forest },
  directionsButtonText: { color: colors.surface, fontSize: 10, fontWeight: "800" },
});
