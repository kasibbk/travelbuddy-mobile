import type { AppCoords, RouteResult } from "./types";

export type NavigationGuidance = {
  progressRatio: number;
  remainingDistanceMeters: number;
  remainingDurationMinutes: number;
  nextInstruction: string | null;
  distanceToNextManeuverMeters: number | null;
};

const EARTH_RADIUS_METERS = 6_371_000;

function distanceMeters(start: AppCoords, end: AppCoords): number {
  const radians = Math.PI / 180;
  const latitudeDelta = (end.lat - start.lat) * radians;
  const longitudeDelta = (end.lng - start.lng) * radians;
  const startLatitude = start.lat * radians;
  const endLatitude = end.lat * radians;
  const haversine = Math.sin(latitudeDelta / 2) ** 2
    + Math.cos(startLatitude) * Math.cos(endLatitude) * Math.sin(longitudeDelta / 2) ** 2;
  return 2 * EARTH_RADIUS_METERS * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine));
}

function routeProgress(points: AppCoords[], location: AppCoords): number | null {
  if (points.length < 2) return null;

  const radians = Math.PI / 180;
  const longitudeScale = Math.cos(location.lat * radians) * EARTH_RADIUS_METERS * radians;
  const latitudeScale = EARTH_RADIUS_METERS * radians;
  const toLocal = (point: AppCoords) => ({
    x: (point.lng - location.lng) * longitudeScale,
    y: (point.lat - location.lat) * latitudeScale,
  });

  let totalDistance = 0;
  let distanceAlongRoute = 0;
  let closestDistanceSquared = Number.POSITIVE_INFINITY;
  let closestProgress = 0;

  for (let index = 0; index < points.length - 1; index += 1) {
    const start = toLocal(points[index]);
    const end = toLocal(points[index + 1]);
    const segmentX = end.x - start.x;
    const segmentY = end.y - start.y;
    const segmentLength = distanceMeters(points[index], points[index + 1]);
    const segmentLengthSquared = segmentX ** 2 + segmentY ** 2;
    const projection = segmentLengthSquared > 0
      ? Math.max(0, Math.min(1, -(start.x * segmentX + start.y * segmentY) / segmentLengthSquared))
      : 0;
    const nearestX = start.x + segmentX * projection;
    const nearestY = start.y + segmentY * projection;
    const distanceSquared = nearestX ** 2 + nearestY ** 2;

    if (distanceSquared < closestDistanceSquared) {
      closestDistanceSquared = distanceSquared;
      closestProgress = totalDistance + segmentLength * projection;
    }

    totalDistance += segmentLength;
    distanceAlongRoute = totalDistance;
  }

  return distanceAlongRoute > 0 ? Math.max(0, Math.min(1, closestProgress / distanceAlongRoute)) : null;
}

export function getNavigationGuidance(route: RouteResult, location: AppCoords): NavigationGuidance | null {
  const progressRatio = routeProgress(route.points, location);
  if (progressRatio === null) return null;

  const totalDistanceMeters = Math.max(0, route.distanceKilometers * 1000);
  const travelledDistanceMeters = totalDistanceMeters * progressRatio;
  const directionsDistanceMeters = route.directions.reduce((total, direction) => total + Math.max(0, direction.distanceMeters), 0);
  let nextInstruction: string | null = null;
  let distanceToNextManeuverMeters: number | null = null;

  if (directionsDistanceMeters > 0) {
    const travelledDirectionsMeters = directionsDistanceMeters * progressRatio;
    let instructionEndMeters = 0;
    for (const direction of route.directions) {
      instructionEndMeters += Math.max(0, direction.distanceMeters);
      if (direction.instruction && instructionEndMeters >= travelledDirectionsMeters) {
        nextInstruction = direction.instruction;
        distanceToNextManeuverMeters = Math.max(0, instructionEndMeters - travelledDirectionsMeters);
        break;
      }
    }
  }

  return {
    progressRatio,
    remainingDistanceMeters: Math.max(0, totalDistanceMeters - travelledDistanceMeters),
    remainingDurationMinutes: Math.max(0, route.estimatedDurationMinutes * (1 - progressRatio)),
    nextInstruction,
    distanceToNextManeuverMeters,
  };
}

export function getNavigationCameraForSpeed(speedMetersPerSecond: number | null): { zoom: number; pitch: number } {
  const speed = typeof speedMetersPerSecond === "number" && Number.isFinite(speedMetersPerSecond)
    ? Math.max(0, speedMetersPerSecond)
    : 0;
  const zoom = speed >= 25 ? 15.5 : speed >= 15 ? 16.25 : speed >= 7 ? 17 : 17.5;
  return { zoom, pitch: 45 };
}

export function formatManeuverDistance(distanceMeters: number): string {
  if (distanceMeters >= 1000) return `${(distanceMeters / 1000).toFixed(distanceMeters >= 10_000 ? 0 : 1)} km`;
  if (distanceMeters >= 100) return `${Math.round(distanceMeters / 10) * 10} m`;
  return `${Math.max(0, Math.round(distanceMeters / 5) * 5)} m`;
}
