import AsyncStorage from "@react-native-async-storage/async-storage";
import { Platform } from "react-native";
import * as Location from "expo-location";
import * as TaskManager from "expo-task-manager";
import { supabase } from "../../lib/supabase";
import type { AppCoords } from "./types";

const LIVE_LOCATION_TASK = "travelbuddy-live-location";
const LEGACY_SHARING_KEY_PREFIX = "live-location-sharing:";
const LIVE_LOCATION_INTERVAL_MS = 30_000;
const LIVE_LOCATION_STALE_AFTER_MS = LIVE_LOCATION_INTERVAL_MS * 3;
let locationStartPromise: Promise<boolean> | null = null;

type LiveLocationTaskData = {
  locations: Location.LocationObject[];
};

export type LiveFriendLocationData = {
  userId: string;
  name: string;
  avatarPath: string | null;
  location: AppCoords;
  updatedAt: string;
};

function legacySharingKey(userId: string) {
  return `${LEGACY_SHARING_KEY_PREFIX}${userId}`;
}

async function migrateLegacySharingPreference(userId: string): Promise<void> {
  if (await AsyncStorage.getItem(legacySharingKey(userId)) !== "enabled") return;
  const { error } = await supabase.from("live_location_preferences")
    .upsert({ user_id: userId, sharing_enabled: true }, { onConflict: "user_id" });
  if (error) throw error;
  await AsyncStorage.removeItem(legacySharingKey(userId));
}

function validateCoordinates(latitude: number, longitude: number) {
  if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90
    || !Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
    throw new Error("The device returned an invalid location.");
  }
}

async function publishLiveLocation(userId: string, latitude: number, longitude: number) {
  validateCoordinates(latitude, longitude);
  const { error } = await supabase.from("live_locations").upsert({
    user_id: userId,
    latitude,
    longitude,
  }, { onConflict: "user_id" });
  if (error) throw error;
}

async function loadLocationPreferences(userId: string) {
  const [profileResult, sharingResult] = await Promise.all([
    supabase.from("profiles").select("discoverable").eq("id", userId).maybeSingle(),
    supabase.from("live_location_preferences").select("sharing_enabled").eq("user_id", userId).maybeSingle(),
  ]);
  if (profileResult.error) throw profileResult.error;
  if (sharingResult.error) throw sharingResult.error;
  return {
    discoverable: profileResult.data?.discoverable ?? false,
    sharingEnabled: sharingResult.data?.sharing_enabled ?? false,
  };
}

async function stopLocationTaskIfRunning() {
  if (locationStartPromise) await locationStartPromise.catch(() => false);
  if (Platform.OS !== "web" && await Location.hasStartedLocationUpdatesAsync(LIVE_LOCATION_TASK)) {
    await Location.stopLocationUpdatesAsync(LIVE_LOCATION_TASK);
  }
}

async function requestLocationPermissions() {
  const foregroundPermission = await Location.requestForegroundPermissionsAsync();
  if (!foregroundPermission.granted) {
    throw new Error(foregroundPermission.canAskAgain
      ? "Allow location access to enable nearby discovery or live sharing."
      : "Location access is off. Enable it in your device settings to continue.");
  }

  const backgroundPermission = await Location.requestBackgroundPermissionsAsync();
  if (!backgroundPermission.granted) {
    throw new Error(backgroundPermission.canAskAgain
      ? "Allow background location access to keep location updates running while TravelBuddy is not open."
      : "Background location access is off. Enable it in your device settings to continue.");
  }

  if (!await Location.hasServicesEnabledAsync()) {
    throw new Error("Turn on device location services to enable location updates.");
  }
}

async function hasLocationPermissions(): Promise<boolean> {
  const [foregroundPermission, backgroundPermission, servicesEnabled] = await Promise.all([
    Location.getForegroundPermissionsAsync(),
    Location.getBackgroundPermissionsAsync(),
    Location.hasServicesEnabledAsync(),
  ]);
  return foregroundPermission.granted && backgroundPermission.granted && servicesEnabled;
}

async function startLocationTrackingOnce(userId: string, requestPermissions: boolean): Promise<boolean> {
  if (Platform.OS === "web") {
    if (requestPermissions) throw new Error("Background location tracking is available in the mobile app.");
    return false;
  }

  const { data: { session }, error: sessionError } = await supabase.auth.getSession();
  if (sessionError) throw sessionError;
  if (session?.user.id !== userId) throw new Error("Sign in again before enabling location updates.");

  const preferences = await loadLocationPreferences(userId);
  if (!preferences.discoverable && !preferences.sharingEnabled) return false;

  const wasRunning = await Location.hasStartedLocationUpdatesAsync(LIVE_LOCATION_TASK);
  if (!wasRunning) {
    if (requestPermissions) await requestLocationPermissions();
    else if (!await hasLocationPermissions()) return false;

    await Location.startLocationUpdatesAsync(LIVE_LOCATION_TASK, {
      accuracy: Location.Accuracy.Balanced,
      timeInterval: LIVE_LOCATION_INTERVAL_MS,
      distanceInterval: 50,
      pausesUpdatesAutomatically: false,
      showsBackgroundLocationIndicator: true,
      foregroundService: {
        notificationTitle: "Location updates are on",
        notificationBody: "TravelBuddy is updating location for your enabled discovery and sharing settings.",
        killServiceOnDestroy: false,
      },
    });
  }

  try {
    const location = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
    await publishLiveLocation(userId, location.coords.latitude, location.coords.longitude);
  } catch (cause) {
    if (!wasRunning && await Location.hasStartedLocationUpdatesAsync(LIVE_LOCATION_TASK)) {
      await Location.stopLocationUpdatesAsync(LIVE_LOCATION_TASK);
    }
    throw cause;
  }
  return true;
}

async function startLocationTracking(userId: string, requestPermissions: boolean): Promise<boolean> {
  while (locationStartPromise) await locationStartPromise.catch(() => false);
  const attempt = startLocationTrackingOnce(userId, requestPermissions);
  locationStartPromise = attempt;
  try {
    return await attempt;
  } finally {
    if (locationStartPromise === attempt) locationStartPromise = null;
  }
}

if (Platform.OS !== "web") {
  TaskManager.defineTask<LiveLocationTaskData>(LIVE_LOCATION_TASK, async ({ data, error }) => {
    if (error) {
      console.warn("[location] Background live-location task failed", error);
      return;
    }

    const latestLocation = data.locations[data.locations.length - 1];
    if (!latestLocation) return;

    try {
      const { data: { session }, error: sessionError } = await supabase.auth.getSession();
      if (sessionError) throw sessionError;
      const userId = session?.user.id;
      if (!userId) {
        await stopLocationTaskIfRunning();
        return;
      }

      const preferences = await loadLocationPreferences(userId);
      if (!preferences.discoverable && !preferences.sharingEnabled) {
        await stopLocationTaskIfRunning();
        const { error: deleteError } = await supabase.from("live_locations").delete().eq("user_id", userId);
        if (deleteError) throw deleteError;
        return;
      }

      await publishLiveLocation(userId, latestLocation.coords.latitude, latestLocation.coords.longitude);
    } catch (cause) {
      console.warn("[location] Could not publish a background live-location update", cause);
    }
  });
}

export async function getLiveLocationSharingEnabled(userId: string): Promise<boolean> {
  if (Platform.OS === "web") return false;
  await migrateLegacySharingPreference(userId);
  const { data, error } = await supabase.from("live_location_preferences")
    .select("sharing_enabled")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw error;
  return data?.sharing_enabled ?? false;
}

export async function enableLiveLocationSharing(userId: string): Promise<void> {
  if (Platform.OS === "web") {
    throw new Error("Background live-location sharing is available in the mobile app.");
  }

  const { data: { session }, error: sessionError } = await supabase.auth.getSession();
  if (sessionError) throw sessionError;
  if (session?.user.id !== userId) throw new Error("Sign in again before sharing your live location.");

  const { error } = await supabase.from("live_location_preferences")
    .upsert({ user_id: userId, sharing_enabled: true }, { onConflict: "user_id" });
  if (error) throw error;
  try {
    await AsyncStorage.removeItem(legacySharingKey(userId));
    await startLocationTracking(userId, true);
  } catch (cause) {
    try {
      const { error: rollbackError } = await supabase.from("live_location_preferences").delete().eq("user_id", userId);
      if (rollbackError) throw rollbackError;
      await reconcileLiveLocationTracking(userId);
    } catch (cleanupError) {
      console.warn("[location] Could not roll back failed live-location sharing", cleanupError);
    }
    throw cause;
  }
}

export async function disableLiveLocationSharing(userId: string): Promise<void> {
  await AsyncStorage.removeItem(legacySharingKey(userId));
  const { error } = await supabase.from("live_location_preferences").delete().eq("user_id", userId);
  if (error) throw error;
  await reconcileLiveLocationTracking(userId);
}

export async function ensureLiveLocationTracking(userId: string): Promise<void> {
  if (Platform.OS === "web") {
    throw new Error("Background location tracking is available in the mobile app.");
  }
  await startLocationTracking(userId, true);
}

export async function resumeLiveLocationTracking(userId: string): Promise<void> {
  if (Platform.OS === "web") return;
  await migrateLegacySharingPreference(userId);
  const preferences = await loadLocationPreferences(userId);
  if (!preferences.discoverable && !preferences.sharingEnabled) {
    await reconcileLiveLocationTracking(userId);
    return;
  }

  if (await Location.hasStartedLocationUpdatesAsync(LIVE_LOCATION_TASK)) {
    const { data, error } = await supabase.from("live_locations")
      .select("updated_at")
      .eq("user_id", userId)
      .maybeSingle();
    if (error) throw error;
    const lastUpdate = data ? Date.parse(data.updated_at) : Number.NaN;
    if (!Number.isFinite(lastUpdate) || Date.now() - lastUpdate > LIVE_LOCATION_STALE_AFTER_MS) {
      await stopLocationTaskIfRunning();
    }
  }

  const resumed = await startLocationTracking(userId, false);
  if (!resumed) console.warn("[location] Tracking is enabled but background location permissions or device services are unavailable.");
}

export async function reconcileLiveLocationTracking(userId: string): Promise<void> {
  const preferences = await loadLocationPreferences(userId);
  if (preferences.discoverable || preferences.sharingEnabled) {
    await startLocationTracking(userId, false);
    return;
  }
  await stopLocationTaskIfRunning();
  const { error } = await supabase.from("live_locations").delete().eq("user_id", userId);
  if (error) throw error;
}

export async function stopLiveLocationTracking(userId: string): Promise<void> {
  await stopLocationTaskIfRunning();
  const { error } = await supabase.from("live_locations").delete().eq("user_id", userId);
  if (error) throw error;
}

export async function stopLocalLiveLocationTask(): Promise<void> {
  await stopLocationTaskIfRunning();
}

export async function loadLiveFriendLocations(userId: string): Promise<LiveFriendLocationData[]> {
  const { error: cleanupError } = await supabase.rpc("purge_expired_live_locations");
  if (cleanupError) throw cleanupError;

  const { data: locations, error } = await supabase.from("live_locations")
    .select("user_id, latitude, longitude, updated_at")
    .neq("user_id", userId)
    .order("updated_at", { ascending: false });
  if (error) throw error;
  if (!locations?.length) return [];

  const userIds = locations.map((location) => location.user_id);
  const { data: profiles, error: profilesError } = await supabase.from("profiles")
    .select("id, display_name, avatar_path")
    .in("id", userIds);
  if (profilesError) throw profilesError;
  const profilesById = new Map((profiles ?? []).map((profile) => [profile.id, profile]));

  return locations.flatMap((location) => {
    const profile = profilesById.get(location.user_id);
    if (!profile) return [];
    return [{
      userId: location.user_id,
      name: profile.display_name,
      avatarPath: profile.avatar_path,
      location: { lat: location.latitude, lng: location.longitude },
      updatedAt: location.updated_at,
    }];
  });
}

export async function loadLiveRideMemberLocations(rideId: string): Promise<LiveFriendLocationData[]> {
  const { data, error } = await supabase.rpc("ride_member_live_locations", { p_ride_id: rideId });
  if (error) throw error;
  return ((data ?? []) as {
    user_id: string;
    display_name: string;
    avatar_path: string | null;
    latitude: number;
    longitude: number;
    updated_at: string;
  }[]).map((location) => ({
    userId: location.user_id,
    name: location.display_name,
    avatarPath: location.avatar_path,
    location: { lat: location.latitude, lng: location.longitude },
    updatedAt: location.updated_at,
  }));
}

export async function loadOwnLiveLocation(userId: string): Promise<AppCoords | null> {
  const freshAfter = new Date(Date.now() - 5 * 60_000).toISOString();
  const { data, error } = await supabase.from("live_locations")
    .select("latitude, longitude")
    .eq("user_id", userId)
    .gt("updated_at", freshAfter)
    .maybeSingle();
  if (error) throw error;
  return data ? { lat: data.latitude, lng: data.longitude } : null;
}
