export function formatRideDistance(distanceKilometers: number): string {
  return `${distanceKilometers.toFixed(distanceKilometers < 10 ? 1 : 0)} km`;
}

export function formatRideDuration(durationMinutes: number): string {
  if (!Number.isFinite(durationMinutes) || durationMinutes <= 0) return "Time not set";
  if (durationMinutes < 60) return `${Math.ceil(durationMinutes)} min`;

  const totalHours = Math.ceil(durationMinutes / 60);
  const days = Math.floor(totalHours / 24);
  const hours = totalHours % 24;
  const parts: string[] = [];
  if (days) parts.push(`${days} day${days === 1 ? "" : "s"}`);
  if (hours) parts.push(`${hours} hour${hours === 1 ? "" : "s"}`);
  return parts.join(" ");
}
