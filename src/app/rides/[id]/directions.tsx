import { useEffect, useState } from "react";
import { useLocalSearchParams, useRouter } from "expo-router";
import { ArrowLeft, Navigation } from "lucide-react-native";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { EmptyState } from "../../../components/empty-state";
import { PageShell } from "../../../components/page-shell";
import { colors } from "../../../components/theme";
import { useAuth } from "../../../components/auth-provider";
import { formatRideDistance, formatRideDuration } from "../../../lib/ride-format";
import { loadRideRoute } from "../../../services/location/ride-route";
import type { LoadedRideRoute } from "../../../services/location/ride-route";

function formatStepDistance(distanceMeters: number): string | null {
  if (!Number.isFinite(distanceMeters) || distanceMeters <= 0) return null;
  return distanceMeters >= 1000
    ? formatRideDistance(distanceMeters / 1000)
    : `${Math.round(distanceMeters)} m`;
}

export default function RideDirectionsScreen() {
  const router = useRouter();
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
          error: cause instanceof Error ? cause.message : "Could not load turn-by-turn directions.",
        });
      });
    return () => { active = false; };
  }, [ready, requestKey, rideId, userId]);

  const currentResult = result?.key === requestKey ? result : null;
  const route = currentResult && "route" in currentResult ? currentResult.route : null;
  const loading = !ready || (Boolean(userId && rideId) && !currentResult);
  const error = ready && (!userId || !rideId)
    ? "Turn-by-turn directions are unavailable for this ride."
    : currentResult && "error" in currentResult ? currentResult.error : "";

  return <PageShell>
    <View style={styles.topbar}>
      <Pressable accessibilityRole="button" accessibilityLabel="Back" onPress={() => router.back()} style={styles.backButton}>
        <ArrowLeft color={colors.ink} size={19} />
      </Pressable>
      <View style={styles.heading}>
        <Text style={styles.eyebrow}>RIDE ROUTE</Text>
        <Text style={styles.title}>Turn-by-turn directions</Text>
      </View>
    </View>
    {loading ? <ActivityIndicator color={colors.leaf} style={styles.loader} />
      : error ? <EmptyState icon={Navigation} title="Directions couldn’t load" description={error} />
      : route ? <>
        <View style={styles.summary}>
          <Text style={styles.rideTitle}>{route.ride.title}</Text>
          <Text style={styles.routeName}>{route.ride.route}</Text>
          <View style={styles.summaryMetrics}>
            <Text style={styles.metric}>{formatRideDistance(route.distanceKilometers)}</Text>
            <Text style={styles.metric}>{formatRideDuration(route.estimatedDurationMinutes)}</Text>
          </View>
        </View>
        {route.directions.length
          ? <View style={styles.steps}>
            {route.directions.map((step, index) => {
              const distance = formatStepDistance(step.distanceMeters);
              const duration = step.durationSeconds > 0 ? formatRideDuration(step.durationSeconds / 60) : null;
              return <View key={`${index}:${step.instruction}`} style={styles.step}>
                <View style={styles.stepNumber}><Text style={styles.stepNumberText}>{index + 1}</Text></View>
                <View style={styles.stepCopy}>
                  <Text style={styles.instruction}>{step.instruction}</Text>
                  {(distance || duration) && <Text style={styles.stepMetrics}>{[distance, duration].filter(Boolean).join(" · ")}</Text>}
                </View>
              </View>;
            })}
          </View>
          : <EmptyState icon={Navigation} title="Step-by-step directions unavailable" description="The route provider didn’t return turn-by-turn instructions for this route." />}
      </> : null}
  </PageShell>;
}

const styles = StyleSheet.create({
  topbar: { minHeight: 52, marginHorizontal: 16, marginTop: 6, marginBottom: 10, flexDirection: "row", alignItems: "center", gap: 10 },
  backButton: { width: 36, height: 36, alignItems: "center", justifyContent: "center", borderRadius: 10, backgroundColor: colors.surface },
  heading: { flex: 1, gap: 3 },
  eyebrow: { color: colors.muted, fontSize: 7, fontWeight: "800", letterSpacing: 0.8 },
  title: { color: colors.ink, fontSize: 15, fontWeight: "800" },
  loader: { marginVertical: 28 },
  summary: { marginHorizontal: 16, marginBottom: 12, padding: 14, borderWidth: 1, borderColor: colors.line, borderRadius: 12, backgroundColor: colors.surface },
  rideTitle: { color: colors.ink, fontFamily: "Georgia", fontSize: 16 },
  routeName: { marginTop: 5, color: colors.muted, fontSize: 9, lineHeight: 14 },
  summaryMetrics: { marginTop: 9, flexDirection: "row", gap: 12 },
  metric: { color: colors.forest, fontSize: 9, fontWeight: "700" },
  steps: { marginHorizontal: 16, paddingHorizontal: 12, borderWidth: 1, borderColor: colors.line, borderRadius: 12, backgroundColor: colors.surface },
  step: { minHeight: 68, flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: "#EEF0E9" },
  stepNumber: { width: 27, height: 27, alignItems: "center", justifyContent: "center", borderRadius: 14, backgroundColor: colors.paleGreen },
  stepNumberText: { color: colors.forest, fontSize: 9, fontWeight: "800" },
  stepCopy: { flex: 1, gap: 4 },
  instruction: { color: colors.ink, fontSize: 10, fontWeight: "700", lineHeight: 15 },
  stepMetrics: { color: colors.muted, fontSize: 8 },
});
