export type AppCoords = {
  lat: number;
  lng: number;
};

export type LocationSearchResult = {
  label: string;
  coords: AppCoords;
};

export type RouteResult = {
  distanceKilometers: number;
  estimatedDurationMinutes: number;
  points: AppCoords[];
};

export interface RoutingService {
  /** Returns the routed distance in kilometers. */
  getDistance(start: AppCoords, end: AppCoords): Promise<number>;
  getRoutePoints(start: AppCoords, end: AppCoords): Promise<AppCoords[]>;
  getRoute(start: AppCoords, end: AppCoords): Promise<RouteResult>;
  geocodeAddress(address: string): Promise<AppCoords | null>;
  searchLocations(query: string): Promise<LocationSearchResult[]>;
  reverseGeocode(coords: AppCoords): Promise<string | null>;
}
