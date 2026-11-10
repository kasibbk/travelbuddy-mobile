import { loadRideDetails } from "../../lib/app-data";
import type { RideCardData } from "../../lib/app-data";
import { LocationService } from "./index";
import type { AppCoords, RouteResult } from "./types";

export type LoadedRideRoute = {
  ride: RideCardData;
  start: AppCoords;
  destination: AppCoords;
} & RouteResult;

export async function loadRideRoute(rideId: string, userId: string): Promise<LoadedRideRoute> {
  const ride = await loadRideDetails(rideId, userId, true);
  if (!ride) throw new Error("This ride is unavailable.");

  const separatorIndex = ride.route.indexOf(" → ");
  if (separatorIndex < 0) throw new Error("This ride has an invalid route.");
  const startLabel = ride.route.slice(0, separatorIndex);
  const destinationLabel = ride.route.slice(separatorIndex + 3);

  const start = ride.startCoords ?? await LocationService.geocodeAddress(startLabel);
  if (!start) throw new Error("Could not find the ride starting point on the map.");
  const destination = ride.destinationCoords ?? await LocationService.geocodeAddress(destinationLabel);
  if (!destination) throw new Error("Could not find the ride destination on the map.");

  return { ride, start, destination, ...await LocationService.getRoute(start, destination) };
}
