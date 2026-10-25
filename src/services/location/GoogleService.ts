import type { AppCoords, LocationSearchResult, RouteResult, RoutingService } from "./types";

const GOOGLE_MAPS_API_KEY = process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY;
const GOOGLE_MAPS_BASE_URL = "https://maps.googleapis.com/maps/api";

type GoogleDirectionsResponse = {
  status: string;
  error_message?: string;
  routes?: { overview_polyline: { points: string }; legs?: { distance?: { value: number }; duration?: { value: number } }[] }[];
};

type GoogleGeocodingResponse = {
  status: string;
  error_message?: string;
  results?: { formatted_address?: string; geometry: { location: { lat: number; lng: number } } }[];
};

function requireApiKey(): string {
  if (!GOOGLE_MAPS_API_KEY) {
    throw new Error("Set EXPO_PUBLIC_GOOGLE_MAPS_API_KEY before enabling Google Maps.");
  }
  return GOOGLE_MAPS_API_KEY;
}

function formatCoords(coords: AppCoords): string {
  return `${coords.lat},${coords.lng}`;
}

async function requestGoogle<T>(path: string, params: Record<string, string>): Promise<T> {
  const url = new URL(`${GOOGLE_MAPS_BASE_URL}/${path}/json`);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  url.searchParams.set("key", requireApiKey());
  const response = await fetch(url.toString());
  if (!response.ok) throw new Error(`Google Maps ${path} request failed (${response.status}).`);
  return await response.json() as T;
}

function assertGoogleStatus(status: string, errorMessage?: string): void {
  if (status !== "OK") {
    throw new Error(errorMessage || `Google Maps request failed (${status}).`);
  }
}

function decodePolyline(encoded: string): AppCoords[] {
  const points: AppCoords[] = [];
  let index = 0;
  let lat = 0;
  let lng = 0;
  while (index < encoded.length) {
    let result = 0;
    let shift = 0;
    let byte: number;
    do {
      if (index >= encoded.length) throw new Error("Google Maps returned an invalid route.");
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);
    lat += result & 1 ? ~(result >> 1) : result >> 1;

    result = 0;
    shift = 0;
    do {
      if (index >= encoded.length) throw new Error("Google Maps returned an invalid route.");
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);
    lng += result & 1 ? ~(result >> 1) : result >> 1;
    points.push({ lat: lat / 1e5, lng: lng / 1e5 });
  }
  return points;
}

export class GoogleService implements RoutingService {
  async getDistance(start: AppCoords, end: AppCoords): Promise<number> {
    return (await this.getRoute(start, end)).distanceKilometers;
  }

  async getRoutePoints(start: AppCoords, end: AppCoords): Promise<AppCoords[]> {
    return (await this.getRoute(start, end)).points;
  }

  async getRoute(start: AppCoords, end: AppCoords): Promise<RouteResult> {
    const result = await requestGoogle<GoogleDirectionsResponse>("directions", {
      origin: formatCoords(start),
      destination: formatCoords(end),
      mode: "driving",
    });
    assertGoogleStatus(result.status, result.error_message);
    const route = result.routes?.[0];
    if (!route?.overview_polyline.points) throw new Error("Google Maps returned no route geometry.");
    const distanceMeters = route.legs?.reduce((sum, leg) => sum + (leg.distance?.value ?? 0), 0) ?? 0;
    const durationSeconds = route.legs?.reduce((sum, leg) => sum + (leg.duration?.value ?? 0), 0) ?? 0;
    if (distanceMeters <= 0) throw new Error("Google Maps returned no route distance.");
    if (durationSeconds <= 0) throw new Error("Google Maps returned no estimated travel time.");
    return {
      distanceKilometers: distanceMeters / 1000,
      estimatedDurationMinutes: Math.ceil(durationSeconds / 60),
      points: decodePolyline(route.overview_polyline.points),
    };
  }

  async geocodeAddress(address: string): Promise<AppCoords | null> {
    const [result] = await this.searchLocations(address);
    return result?.coords ?? null;
  }

  async searchLocations(query: string): Promise<LocationSearchResult[]> {
    const searchText = query.trim();
    if (!searchText) return [];
    const result = await requestGoogle<GoogleGeocodingResponse>("geocode", { address: searchText });
    if (result.status === "ZERO_RESULTS") return [];
    assertGoogleStatus(result.status, result.error_message);
    return (result.results ?? []).flatMap((item) => {
      const label = item.formatted_address?.trim();
      const { lat, lng } = item.geometry.location;
      if (!label || !Number.isFinite(lat) || !Number.isFinite(lng)) return [];
      return [{ label, coords: { lat, lng } }];
    });
  }

  async reverseGeocode(coords: AppCoords): Promise<string | null> {
    const result = await requestGoogle<GoogleGeocodingResponse>("geocode", { latlng: formatCoords(coords) });
    if (result.status === "ZERO_RESULTS") return null;
    assertGoogleStatus(result.status, result.error_message);
    return result.results?.[0]?.formatted_address?.trim() || null;
  }
}
