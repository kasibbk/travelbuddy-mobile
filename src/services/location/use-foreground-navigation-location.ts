import { useCallback, useState } from "react";
import { useFocusEffect } from "expo-router";
import { AppState, Platform } from "react-native";
import * as Location from "expo-location";
import type { AppCoords } from "./types";

const NAVIGATION_TIME_INTERVAL_MS = 3_000;
const NAVIGATION_DISTANCE_INTERVAL_METERS = 5;

function movementHeading(location: Location.LocationObject): number | null {
  const { heading, speed } = location.coords;
  if (heading === null || !Number.isFinite(heading) || heading < 0 || (speed !== null && speed < 0.5)) return null;
  return heading % 360;
}

export function useForegroundNavigationLocation(enabled: boolean, onLocation?: (location: AppCoords, heading: number | null, speed: number | null) => void) {
  const [location, setLocation] = useState<AppCoords | null>(null);
  const [error, setError] = useState("");

  useFocusEffect(useCallback(() => {
    if (!enabled || Platform.OS === "web") return;

    let active = true;
    let starting = false;
    let subscription: Location.LocationSubscription | null = null;

    async function startWatching() {
      if (!active || starting || subscription || AppState.currentState !== "active") return;
      starting = true;
      try {
        const permission = await Location.requestForegroundPermissionsAsync();
        if (!permission.granted) throw new Error("Allow foreground location access to follow your position on the map.");
        if (!await Location.hasServicesEnabledAsync()) throw new Error("Turn on device location services to follow your position.");

        const initialLocation = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
        if (!active || AppState.currentState !== "active") return;
        const initialCoords = { lat: initialLocation.coords.latitude, lng: initialLocation.coords.longitude };
        setLocation(initialCoords);
        setError("");
        onLocation?.(initialCoords, movementHeading(initialLocation), initialLocation.coords.speed);

        const nextSubscription = await Location.watchPositionAsync({
          accuracy: Location.Accuracy.High,
          timeInterval: NAVIGATION_TIME_INTERVAL_MS,
          distanceInterval: NAVIGATION_DISTANCE_INTERVAL_METERS,
        }, (nextLocation) => {
          if (!active) return;
          const coords = { lat: nextLocation.coords.latitude, lng: nextLocation.coords.longitude };
          setLocation(coords);
          setError("");
          onLocation?.(coords, movementHeading(nextLocation), nextLocation.coords.speed);
        });
        if (!active || AppState.currentState !== "active") {
          nextSubscription.remove();
          return;
        }
        subscription = nextSubscription;
      } catch (cause) {
        if (active) {
          const message = cause instanceof Error ? cause.message : "Could not follow your current location.";
          setError(message);
          console.warn("[location] Foreground navigation location unavailable", cause);
        }
      } finally {
        starting = false;
      }
    }

    const appStateSubscription = AppState.addEventListener("change", (state) => {
      if (state === "active") {
        void startWatching();
      } else {
        subscription?.remove();
        subscription = null;
      }
    });
    void startWatching();
    return () => {
      active = false;
      appStateSubscription.remove();
      subscription?.remove();
    };
  }, [enabled, onLocation]));

  return { location, error };
}
