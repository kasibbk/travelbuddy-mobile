import type { AppCoords, LocationSearchResult, RouteResult, RoutingService } from "./types";

const MOTOR_ROUTING_URL = "https://routing.openstreetmap.de/routed-car/route/v1/driving";
const NOMINATIM_URL = "https://nominatim.openstreetmap.org/search";
const NOMINATIM_REVERSE_URL = "https://nominatim.openstreetmap.org/reverse";

let nextRoutingRequestAt = 0;
let nextGeocodingRequestAt = 0;

type OsrmRouteResponse = {
  code: string;
  routes?: { distance: number; duration: number; geometry: { coordinates: [number, number][] } }[];
};

type NominatimSearchResult = {
  lat: string;
  lon: string;
  display_name?: string;
};

type NominatimReverseResult = {
  display_name?: string;
};

async function respectPublicServiceLimit(kind: "routing" | "geocoding"): Promise<void> {
  const nextRequestAt = kind === "routing" ? nextRoutingRequestAt : nextGeocodingRequestAt;
  const waitMs = Math.max(0, nextRequestAt - Date.now());
  const next = Date.now() + waitMs + 1000;
  if (kind === "routing") nextRoutingRequestAt = next;
  else nextGeocodingRequestAt = next;
  if (waitMs > 0) await new Promise<void>((resolve) => setTimeout(resolve, waitMs));
}

async function loadRoute(start: AppCoords, end: AppCoords): Promise<OsrmRouteResponse> {
  await respectPublicServiceLimit("routing");
  const coordinates = `${start.lng},${start.lat};${end.lng},${end.lat}`;
  const response = await fetch(`${MOTOR_ROUTING_URL}/${coordinates}?overview=full&geometries=geojson&steps=false`);
  if (!response.ok) throw new Error(`OpenStreetMap routing failed (${response.status}).`);
  const result = await response.json() as OsrmRouteResponse;
  if (result.code !== "Ok" || !result.routes?.[0]) {
    throw new Error("No motor-vehicle route could be found between these locations.");
  }
  return result;
}

function firstRoute(result: OsrmRouteResponse) {
  const route = result.routes?.[0];
  if (!route) throw new Error("No motor-vehicle route could be found between these locations.");
  return route;
}

export class OpenSourceService implements RoutingService {
  async getDistance(start: AppCoords, end: AppCoords): Promise<number> {
    return (await this.getRoute(start, end)).distanceKilometers;
  }

  async getRoutePoints(start: AppCoords, end: AppCoords): Promise<AppCoords[]> {
    return (await this.getRoute(start, end)).points;
  }

  async getRoute(start: AppCoords, end: AppCoords): Promise<RouteResult> {
    const route = firstRoute(await loadRoute(start, end));
    if (route.distance <= 0) throw new Error("OpenStreetMap returned no route distance.");
    if (route.duration <= 0) throw new Error("OpenStreetMap returned no estimated travel time.");
    return {
      distanceKilometers: route.distance / 1000,
      estimatedDurationMinutes: Math.ceil(route.duration / 60),
      points: route.geometry.coordinates.map(([lng, lat]) => ({ lat, lng })),
    };
  }

  async geocodeAddress(address: string): Promise<AppCoords | null> {
    const [result] = await this.searchLocations(address);
    return result?.coords ?? null;
  }

  async searchLocations(query: string): Promise<LocationSearchResult[]> {
    const searchText = query.trim();
    if (!searchText) return [];
    await respectPublicServiceLimit("geocoding");
    const url = new URL(NOMINATIM_URL);
    url.searchParams.set("q", searchText);
    url.searchParams.set("format", "jsonv2");
    url.searchParams.set("limit", "5");
    const response = await fetch(url.toString(), {
      headers: {
        Accept: "application/json",
        "User-Agent": "TravelBuddyMobile/1.0",
      },
    });
    if (!response.ok) throw new Error(`OpenStreetMap geocoding failed (${response.status}).`);
    const results = await response.json() as NominatimSearchResult[];
    return results.flatMap((result) => {
      const lat = Number(result.lat);
      const lng = Number(result.lon);
      const label = result.display_name?.trim();
      if (!Number.isFinite(lat) || !Number.isFinite(lng) || !label) return [];
      return [{ label, coords: { lat, lng } }];
    });
  }

  async reverseGeocode(coords: AppCoords): Promise<string | null> {
    await respectPublicServiceLimit("geocoding");
    const url = new URL(NOMINATIM_REVERSE_URL);
    url.searchParams.set("lat", String(coords.lat));
    url.searchParams.set("lon", String(coords.lng));
    url.searchParams.set("format", "jsonv2");
    const response = await fetch(url.toString(), {
      headers: {
        Accept: "application/json",
        "User-Agent": "TravelBuddyMobile/1.0",
      },
    });
    if (!response.ok) throw new Error(`OpenStreetMap reverse geocoding failed (${response.status}).`);
    const result = await response.json() as NominatimReverseResult;
    return result.display_name?.trim() || null;
  }
}
