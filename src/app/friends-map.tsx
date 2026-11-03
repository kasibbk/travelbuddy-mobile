import { useCallback, useState } from "react";
import { ArrowLeft, MapPin, Users } from "lucide-react-native";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { supabase } from "../lib/supabase";
import { AppHeader } from "../components/app-header";
import { Avatar } from "../components/avatar";
import { EmptyState } from "../components/empty-state";
import { PageShell } from "../components/page-shell";
import { colors } from "../components/theme";
import { useAuth } from "../components/auth-provider";
import { getImagePublicUrl } from "../lib/app-data";
import { UnifiedMapView } from "../components/UnifiedMapView";
import { loadLiveFriendLocations, loadOwnLiveLocation, LiveFriendLocationData } from "../services/location/live-tracking";
import type { AppCoords } from "../services/location/types";

function updatedLabel(updatedAt: string) {
  const minutes = Math.max(0, Math.floor((Date.now() - new Date(updatedAt).getTime()) / 60_000));
  if (minutes === 0) return "Updated just now";
  if (minutes === 1) return "Updated 1 minute ago";
  return `Updated ${minutes} minutes ago`;
}

export default function FriendsMapScreen() {
  const router = useRouter();
  const { ready, userId } = useAuth();
  const [locations, setLocations] = useState<LiveFriendLocationData[]>([]);
  const [selfLocation, setSelfLocation] = useState<AppCoords | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [realtimeConnected, setRealtimeConnected] = useState(false);

  useFocusEffect(useCallback(() => {
    if (!ready || !userId) {
      setLoading(false);
      setLocations([]);
      setSelfLocation(null);
      return;
    }

    let active = true;
    async function refreshLocations() {
      try {
        const [rows, ownLocation] = await Promise.all([
          loadLiveFriendLocations(userId),
          loadOwnLiveLocation(userId),
        ]);
        if (active) {
          setLocations(rows);
          setSelfLocation(ownLocation);
          setError("");
        }
      } catch (cause) {
        if (active) setError(cause instanceof Error ? cause.message : "Could not load live friend locations.");
      } finally {
        if (active) setLoading(false);
      }
    }

    void refreshLocations();
    const interval = setInterval(() => { void refreshLocations(); }, 15_000);
    const channel = supabase.channel(`friends-live-locations:${userId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "live_locations" }, () => { void refreshLocations(); })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "live_locations" }, () => { void refreshLocations(); })
      .subscribe((status) => {
        if (!active) return;
        setRealtimeConnected(status === "SUBSCRIBED");
        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          console.warn("[location] Live-location subscription unavailable; periodic refresh remains active.");
        }
      });

    return () => {
      active = false;
      clearInterval(interval);
      setRealtimeConnected(false);
      void supabase.removeChannel(channel);
    };
  }, [ready, userId]));

  const refresh = useCallback(async () => {
    if (!userId || refreshing) return;
    setRefreshing(true);
    try {
      const [rows, ownLocation] = await Promise.all([
        loadLiveFriendLocations(userId),
        loadOwnLiveLocation(userId),
      ]);
      setLocations(rows);
      setSelfLocation(ownLocation);
      setError("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not refresh live friend locations.");
    } finally {
      setRefreshing(false);
    }
  }, [refreshing, userId]);

  const showShareReminder = locations.length === 0 && !loading && !error;
  return <PageShell refreshing={refreshing} onRefresh={() => void refresh()}>
    <View style={styles.topbar}>
      <Pressable accessibilityLabel="Back to friends" onPress={() => router.back()} style={styles.backButton}>
        <ArrowLeft color={colors.ink} size={19} />
      </Pressable>
      <View style={styles.topbarCopy}>
        <Text style={styles.eyebrow}>FRIENDS</Text>
        <Text style={styles.topbarTitle}>Live map</Text>
      </View>
      <Text style={[styles.connection, realtimeConnected && styles.connected]}>{realtimeConnected ? "LIVE" : "SYNCING"}</Text>
    </View>
    <AppHeader eyebrow="YOUR CIRCLE" title="Friends nearby in real time" subtitle="Your marker appears while Nearby discovery or live sharing is on. Accepted friends appear when both of you share." />
    {loading ? <ActivityIndicator color={colors.leaf} style={styles.loader} />
      : error && locations.length === 0 ? <EmptyState icon={Users} title="Live locations couldn’t load" description={error} />
      : <>
        <UnifiedMapView
          userLocation={selfLocation}
          destinationLocation={null}
          routePoints={[]}
          userLocationTitle="You"
          showUserLocationTitle
          friendMarkers={locations.map((friend) => ({
            id: friend.userId,
            location: friend.location,
            title: friend.name,
          }))}
          fitToMarkers
          style={styles.map}
        />
        {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text>
          : showShareReminder ? <EmptyState icon={MapPin} title="No live locations to show" description="Turn on live sharing in the Friends tab. Your accepted friends will appear here when they turn it on too." />
          : locations.length > 0 && <View style={styles.friendList}>
            {locations.map((friend) => <View key={friend.userId} style={styles.friendRow}>
              <Avatar
                initials={friend.name.split(/\s+/).map((part) => part[0]).join("").slice(0, 2).toUpperCase()}
                imageUrl={getImagePublicUrl("profile-images", friend.avatarPath)}
                size={38}
              />
              <View style={styles.friendCopy}>
                <Text style={styles.friendName}>{friend.name}</Text>
                <Text style={styles.friendUpdated}>{updatedLabel(friend.updatedAt)}</Text>
              </View>
            </View>)}
          </View>}
      </>}
  </PageShell>;
}

const styles = StyleSheet.create({
  topbar: { marginHorizontal: 16, marginTop: 6, marginBottom: 8, flexDirection: "row", alignItems: "center", gap: 10 },
  backButton: { width: 36, height: 36, alignItems: "center", justifyContent: "center", borderRadius: 10, backgroundColor: colors.surface },
  topbarCopy: { flex: 1, gap: 2 },
  eyebrow: { color: colors.muted, fontSize: 7, fontWeight: "800", letterSpacing: 0.8 },
  topbarTitle: { color: colors.ink, fontSize: 15, fontWeight: "800" },
  connection: { color: colors.muted, fontSize: 8, fontWeight: "800", letterSpacing: 0.5 },
  connected: { color: colors.leaf },
  loader: { marginVertical: 28 },
  map: { height: 470, marginHorizontal: 16, marginBottom: 12 },
  error: { marginHorizontal: 20, marginBottom: 12, color: "#9B493C", fontSize: 9 },
  friendList: { marginHorizontal: 16, paddingHorizontal: 12, borderWidth: 1, borderColor: colors.line, borderRadius: 11, backgroundColor: colors.surface },
  friendRow: { minHeight: 62, borderBottomWidth: 1, borderBottomColor: "#EEF0E9", flexDirection: "row", alignItems: "center", gap: 10 },
  friendCopy: { flex: 1, gap: 4 },
  friendName: { color: colors.ink, fontSize: 10, fontWeight: "700" },
  friendUpdated: { color: colors.muted, fontSize: 8 },
});
