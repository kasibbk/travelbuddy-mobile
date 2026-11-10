import { useCallback, useRef, useState } from "react";
import { ArrowLeft, Compass, LocateFixed, MapPin, Minus, Navigation, Plus, Route, Users } from "lucide-react-native";
import { ActivityIndicator, Modal, Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import * as Location from "expo-location";
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

type CameraAction = "center" | "zoom-in" | "zoom-out" | "overview" | "north";

function updatedLabel(updatedAt: string) {
  const minutes = Math.max(0, Math.floor((Date.now() - new Date(updatedAt).getTime()) / 60_000));
  if (minutes === 0) return "Updated just now";
  if (minutes === 1) return "Updated 1 minute ago";
  return `Updated ${minutes} minutes ago`;
}

export default function FriendsMapScreen() {
  const router = useRouter();
  const { friendId: friendIdParam } = useLocalSearchParams<{ friendId?: string }>();
  const { ready, userId } = useAuth();
  const [locations, setLocations] = useState<LiveFriendLocationData[]>([]);
  const [selfLocation, setSelfLocation] = useState<AppCoords | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [cameraError, setCameraError] = useState("");
  const [centering, setCentering] = useState(false);
  const [realtimeConnected, setRealtimeConnected] = useState(false);
  const [selectedFriendId, setSelectedFriendId] = useState<string | null>(null);
  const [cameraCommand, setCameraCommand] = useState<{ id: number; action: CameraAction; target?: AppCoords } | null>(null);
  const cameraCommandId = useRef(0);
  const requestedFriendId = typeof friendIdParam === "string" ? friendIdParam : null;

  useFocusEffect(useCallback(() => {
    if (!ready || !userId) {
      setLoading(false);
      setLocations([]);
      setSelfLocation(null);
      return;
    }

    let active = true;
    let shouldCenterRequestedFriend = Boolean(requestedFriendId);
    async function refreshLocations() {
      try {
        const [rows, ownLocation] = await Promise.all([
          loadLiveFriendLocations(userId),
          loadOwnLiveLocation(userId),
        ]);
        if (active) {
          setLocations(rows);
          const requestedFriend = shouldCenterRequestedFriend
            ? rows.find((friend) => friend.userId === requestedFriendId)
            : null;
          if (requestedFriend) {
            shouldCenterRequestedFriend = false;
            centerOnFriend(requestedFriend);
          }
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
  }, [ready, userId, requestedFriendId]));

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
  const selectedFriend = locations.find((friend) => friend.userId === selectedFriendId) ?? null;
  function centerOnFriend(friend: LiveFriendLocationData) {
    setCameraCommand({ id: ++cameraCommandId.current, action: "center", target: friend.location });
  }

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

  return <PageShell refreshing={refreshing} onRefresh={() => void refresh()}>
    <View style={styles.topbar}>
      <View style={styles.topbarGroup}>
        <Pressable accessibilityLabel="Back to friends" onPress={() => router.back()} style={styles.backButton}>
          <ArrowLeft color={colors.ink} size={19} />
        </Pressable>
        <View style={styles.topbarCopy}>
          <Text style={styles.eyebrow}>FRIENDS</Text>
          <Text style={styles.topbarTitle}>Live map</Text>
        </View>
      </View>
      <Text style={[styles.connection, realtimeConnected && styles.connected]}>{realtimeConnected ? "LIVE" : "SYNCING"}</Text>
    </View>
    <AppHeader eyebrow="YOUR CIRCLE" title="Friends nearby in real time" subtitle="Your marker appears while Nearby discovery or live sharing is on. Accepted friends appear when both of you share." />
    {loading ? <ActivityIndicator color={colors.leaf} style={styles.loader} />
      : error && locations.length === 0 ? <EmptyState icon={Users} title="Live locations couldn’t load" description={error} />
      : <>
        <View style={styles.mapFrame}>
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
            onFriendMarkerPress={setSelectedFriendId}
            cameraCommand={cameraCommand}
            style={styles.map}
          />
          {Platform.OS !== "web" && <View style={styles.mapControls}>
            <Pressable accessibilityRole="button" accessibilityLabel="Center on current location" disabled={centering} onPress={() => { void centerOnCurrentLocation(); }} style={[styles.mapControl, centering && styles.mapControlDisabled]}>
              {centering ? <ActivityIndicator size="small" color={colors.forest} /> : <LocateFixed color={colors.forest} size={19} />}
            </Pressable>
            <Pressable accessibilityRole="button" accessibilityLabel="Show all friends and your location" onPress={() => sendCameraCommand("overview")} style={styles.mapControl}>
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
        </View>
        {!!cameraError && <Text accessibilityRole="alert" style={styles.error}>{cameraError}</Text>}
        {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text>
          : showShareReminder ? <EmptyState icon={MapPin} title="No live locations to show" description="Turn on live sharing in the Friends tab. Your accepted friends will appear here when they turn it on too." />
          : locations.length > 0 && <View style={styles.friendList}>
            {locations.map((friend) => <Pressable
              key={friend.userId}
              accessibilityRole="button"
              accessibilityLabel={`Center map on ${friend.name}`}
              onPress={() => centerOnFriend(friend)}
              style={styles.friendRow}
            >
              <Avatar
                initials={friend.name.split(/\s+/).map((part) => part[0]).join("").slice(0, 2).toUpperCase()}
                imageUrl={getImagePublicUrl("profile-images", friend.avatarPath)}
                size={38}
              />
              <View style={styles.friendCopy}>
                <Text style={styles.friendName}>{friend.name}</Text>
                <Text style={styles.friendUpdated}>{updatedLabel(friend.updatedAt)}</Text>
              </View>
            </Pressable>)}
          </View>}
      </>}
    <Modal transparent visible={selectedFriend !== null} animationType="fade" onRequestClose={() => setSelectedFriendId(null)}>
      <View style={styles.modalBackdrop}>
        <View style={styles.routePrompt}>
          <Text style={styles.promptEyebrow}>LIVE LOCATION</Text>
          <Text style={styles.promptTitle}>Route to {selectedFriend?.name}</Text>
          <Text style={styles.promptDescription}>
            {selectedFriend
              ? `${updatedLabel(selectedFriend.updatedAt)}. The destination will keep updating as their location refreshes.`
              : ""}
          </Text>
          <View style={styles.promptActions}>
            <Pressable accessibilityRole="button" onPress={() => setSelectedFriendId(null)} style={styles.cancelButton}>
              <Text style={styles.cancelText}>Cancel</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              onPress={() => {
                if (!selectedFriend) return;
                const friendId = selectedFriend.userId;
                setSelectedFriendId(null);
                router.push({ pathname: "/friends-live-route", params: { friendId } });
              }}
              style={styles.routeButton}
            >
              <Navigation color={colors.surface} size={15} />
              <Text style={styles.routeButtonText}>Route to them</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  </PageShell>;
}

const styles = StyleSheet.create({
  topbar: { marginHorizontal: 16, marginTop: 6, marginBottom: 8, flexDirection: "row", alignItems: "center", gap: 10 },
  topbarGroup: { flexDirection: "row", alignItems: "center", gap: 10, paddingRight: 12, borderRadius: 10, backgroundColor: colors.surface, flexShrink: 1 },
  backButton: { width: 36, height: 36, alignItems: "center", justifyContent: "center", borderRadius: 10, backgroundColor: "transparent" },
  topbarCopy: { gap: 2, flexShrink: 1 },
  eyebrow: { color: colors.muted, fontSize: 7, fontWeight: "800", letterSpacing: 0.8 },
  topbarTitle: { color: colors.ink, fontSize: 15, fontWeight: "800" },
  connection: { color: colors.muted, fontSize: 8, fontWeight: "800", letterSpacing: 0.5 },
  connected: { color: colors.leaf },
  loader: { marginVertical: 28 },
  mapFrame: { height: 470, marginHorizontal: 16, marginBottom: 12, position: "relative" },
  map: { height: "100%" },
  mapControls: { position: "absolute", top: 12, right: 12, padding: 4, alignItems: "center", gap: 3, borderWidth: 1, borderColor: colors.line, borderRadius: 13, backgroundColor: colors.surface, shadowColor: "#000000", shadowOpacity: 0.14, shadowRadius: 8, elevation: 4 },
  mapControl: { width: 40, height: 40, alignItems: "center", justifyContent: "center", borderRadius: 9 },
  mapControlDisabled: { opacity: 0.55 },
  controlDivider: { width: 24, height: 1, marginVertical: 2, backgroundColor: colors.line },
  error: { marginHorizontal: 20, marginBottom: 12, color: "#9B493C", fontSize: 9 },
  friendList: { marginHorizontal: 16, paddingHorizontal: 12, borderWidth: 1, borderColor: colors.line, borderRadius: 11, backgroundColor: colors.surface },
  friendRow: { minHeight: 62, borderBottomWidth: 1, borderBottomColor: "#EEF0E9", flexDirection: "row", alignItems: "center", gap: 10 },
  friendCopy: { flex: 1, gap: 4 },
  friendName: { color: colors.ink, fontSize: 10, fontWeight: "700" },
  friendUpdated: { color: colors.muted, fontSize: 8 },
  modalBackdrop: { flex: 1, justifyContent: "center", padding: 22, backgroundColor: "rgba(12, 24, 19, 0.48)" },
  routePrompt: { padding: 18, borderWidth: 1, borderColor: colors.line, borderRadius: 16, backgroundColor: colors.surface },
  promptEyebrow: { color: colors.muted, fontSize: 8, fontWeight: "800", letterSpacing: 0.8 },
  promptTitle: { marginTop: 6, color: colors.ink, fontSize: 17, fontWeight: "800" },
  promptDescription: { marginTop: 8, color: colors.muted, fontSize: 10, lineHeight: 15 },
  promptActions: { marginTop: 18, flexDirection: "row", justifyContent: "flex-end", gap: 8 },
  cancelButton: { minHeight: 42, justifyContent: "center", paddingHorizontal: 14, borderRadius: 10, backgroundColor: colors.paleGreen },
  cancelText: { color: colors.forest, fontSize: 10, fontWeight: "800" },
  routeButton: { minHeight: 42, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 7, paddingHorizontal: 14, borderRadius: 10, backgroundColor: colors.forest },
  routeButtonText: { color: colors.surface, fontSize: 10, fontWeight: "800" },
});
