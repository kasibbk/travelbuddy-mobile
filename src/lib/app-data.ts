import { supabase } from "./supabase";
import { localFirst } from "./local-first";
import { readStored, removeStored, updateStored, writeStored } from "./local-store";
import { loadNotifications } from "./notifications";
import { formatRideDistance, formatRideDuration } from "./ride-format";
import { LocationService } from "../services/location";
import type { AppCoords, RouteResult } from "../services/location/types";

const conversationsKey = "conversations-v7";
const messageClearEpoch = new Map<string, number>();
const openRidesKey = "open-rides-v5";
const userRidesKey = "user-rides-v5";
const rideDetailsKey = (rideId: string) => `ride-details-v4:${rideId}`;
const profileKey = "profile-v2";
const RIDE_EXPIRY_MS = 24 * 60 * 60 * 1000;
export const MAX_MESSAGE_ATTACHMENT_SIZE_BYTES = 20 * 1024 * 1024;

export type ImageUploadAsset = {
  uri: string;
  mimeType?: string | null;
  fileName?: string | null;
  fileSize?: number | null;
};

// Mutations already succeeded on the server, so a failed follow-up refresh must not surface as a mutation error.
async function refreshStored(...tasks: Promise<unknown>[]): Promise<void> {
  await Promise.allSettled(tasks);
}

type RideRow = {
  id: string;
  creator_id: string;
  title: string;
  description: string;
  start_label: string;
  destination_label: string;
  starts_at: string;
  distance_meters: number | null;
  estimated_duration_minutes: number | null;
  route_data: unknown;
  capacity: number;
  banner_image_path: string | null;
  status: "open" | "started" | "cancelled" | "completed" | "expired";
  creator: { display_name: string } | null;
};

export type RideCardData = {
  id: string;
  creatorId: string;
  title: string;
  route: string;
  date: string;
  time: string;
  distanceMeters: number | null;
  estimatedDurationMinutes: number | null;
  startCoords: AppCoords | null;
  destinationCoords: AppCoords | null;
  distance: string;
  duration: string;
  capacity: number;
  host: string;
  description: string;
  bannerImagePath: string | null;
  startsAt: string;
  status: "open" | "started" | "cancelled" | "completed" | "expired";
};

export type RideParticipantData = {
  userId: string;
  displayName: string;
  avatarPath: string | null;
  role: "owner" | "admin" | "member";
};

export type ConversationParticipantData = {
  userId: string;
  displayName: string;
  avatarPath: string | null;
  joinedAt: string;
};

export type SharedRideData = {
  id: string;
  title: string;
  route: string;
  startsAt: string;
  distance: string;
  duration: string;
};

export type AdminRequestData = {
  id: string;
  rideId: string;
  rideTitle: string;
  riderName: string;
  avatarPath: string | null;
  message: string;
  createdAt: string;
};

export type RideAdminData = {
  rideId: string;
  userId: string;
  name: string;
  role: "owner" | "admin";
};

export type RideRequestStatus = "pending" | "approved" | "declined" | "cancelled";

export type RideRequestData = {
  id: string;
  rideId: string;
  status: RideRequestStatus;
};

export type NearbyRiderData = {
  id: string;
  name: string;
  avatarPath: string | null;
  city: string | null;
  distanceKm: number;
};

export type PublicUserSearchData = {
  id: string;
  name: string;
  avatarPath: string | null;
};

export type FriendData = {
  id: string;
  otherUserId: string;
  name: string;
  avatarPath: string | null;
  status: "pending" | "accepted" | "declined";
  direction: "incoming" | "outgoing";
};

export type ConversationData = {
  id: string;
  kind: "direct" | "ride" | "group";
  rideId: string | null;
  otherUserId: string | null;
  avatarPath: string | null;
  bannerImagePath: string | null;
  title: string;
  detail: string;
  lastMessage: string;
  lastMessageSender: string | null;
  lastMessageStatus: MessageDeliveryStatus | null;
  updatedAt: string;
  unreadCount: number;
  mutedUntil: string | null;
  mutedForever: boolean;
  background: ChatBackground;
  clearedAt: string | null;
};

export type ChatBackground = "default" | "forest" | "ocean" | "rose" | "sand" | "lavender";

export type MessageDeliveryStatus = "sent" | "delivered" | "read";

export type MessageData = {
  id: string;
  senderId: string;
  body: string;
  createdAt: string;
  replyToMessageId: string | null;
  attachmentPath: string | null;
  attachmentName: string | null;
  attachmentMimeType: string | null;
  isForwarded: boolean;
  attachmentUrl?: string | null;
  deliveryStatus?: MessageDeliveryStatus;
};

export type SharedAttachmentData = {
  id: string;
  attachmentPath: string;
  attachmentName: string;
  attachmentMimeType: string | null;
  createdAt: string;
  kind: "image" | "video" | "audio" | "document";
};

export function getAttachmentKind(
  mimeType: string | null | undefined,
  fileName: string | null | undefined,
  path?: string | null,
): SharedAttachmentData["kind"] {
  const normalizedType = mimeType?.split(";")[0].toLowerCase() ?? "";
  if (normalizedType.startsWith("image/")) return "image";
  if (normalizedType.startsWith("video/")) return "video";
  if (normalizedType.startsWith("audio/")) return "audio";
  const normalizedName = `${fileName ?? ""} ${path ?? ""}`.toLowerCase();
  if (/\.(jpe?g|png|gif|webp|heic|heif|bmp|tiff?)\b/.test(normalizedName)) return "image";
  if (/\.(mp4|mov|m4v|webm|mkv|avi|3gp)\b/.test(normalizedName)) return "video";
  if (/\.(mp3|m4a|aac|wav|ogg|flac|opus)\b/.test(normalizedName)) return "audio";
  return "document";
}

export type ProfileData = {
  id: string;
  displayName: string;
  avatarPath: string | null;
  homeCity: string | null;
  bio: string;
  ridingPace: string;
  discoverable: boolean;
};

export type PublicProfileData = Omit<ProfileData, "discoverable">;

const rideSelect = "id, creator_id, title, description, start_label, destination_label, starts_at, distance_meters, estimated_duration_minutes, route_data, capacity, banner_image_path, status, creator:profiles!rides_creator_id_fkey(display_name)";

function getRouteCoordinates(routeData: unknown): { start: AppCoords; destination: AppCoords } | null {
  if (typeof routeData !== "object" || routeData === null) return null;
  const { start, destination } = routeData as { start?: unknown; destination?: unknown };
  function isCoords(value: unknown): value is AppCoords {
    if (typeof value !== "object" || value === null) return false;
    const coords = value as { lat?: unknown; lng?: unknown };
    return typeof coords.lat === "number" && Number.isFinite(coords.lat)
      && typeof coords.lng === "number" && Number.isFinite(coords.lng);
  }
  return isCoords(start) && isCoords(destination) ? { start, destination } : null;
}

function mapRide(row: RideRow): RideCardData {
  const startsAt = new Date(row.starts_at);
  const routeCoordinates = getRouteCoordinates(row.route_data);
  const distance = row.distance_meters === null
    ? "Route distance not set"
    : formatRideDistance(row.distance_meters / 1000);
  return {
    id: row.id,
    creatorId: row.creator_id,
    title: row.title,
    route: `${row.start_label} → ${row.destination_label}`,
    date: startsAt.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" }),
    time: startsAt.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" }),
    distanceMeters: row.distance_meters,
    estimatedDurationMinutes: row.estimated_duration_minutes,
    startCoords: routeCoordinates?.start ?? null,
    destinationCoords: routeCoordinates?.destination ?? null,
    distance,
    duration: row.estimated_duration_minutes === null ? "Time not set" : formatRideDuration(row.estimated_duration_minutes),
    capacity: row.capacity,
    host: row.creator?.display_name ?? "Ride host",
    description: row.description,
    bannerImagePath: row.banner_image_path,
    startsAt: row.starts_at,
    status: row.status === "open" && startsAt.getTime() + RIDE_EXPIRY_MS <= Date.now() ? "expired" : row.status,
  };
}

async function expireStaleRides(): Promise<void> {
  const { error } = await supabase.rpc("expire_stale_rides");
  if (error) throw error;
}

async function calculateRideMetrics(
  startLabel: string,
  destinationLabel: string,
  startCoords?: AppCoords,
  destinationCoords?: AppCoords,
): Promise<{ start: AppCoords; destination: AppCoords; route: RouteResult }> {
  const start = startCoords ?? await LocationService.geocodeAddress(startLabel);
  if (!start) throw new Error("Could not find the ride starting point on the map.");
  const destination = destinationCoords ?? await LocationService.geocodeAddress(destinationLabel);
  if (!destination) throw new Error("Could not find the ride destination on the map.");
  return { start, destination, route: await LocationService.getRoute(start, destination) };
}

export async function loadOpenRides(userId: string, force = false): Promise<RideCardData[]> {
  const rides = await localFirst(userId, openRidesKey, async () => {
    await expireStaleRides();
    const { data, error } = await supabase.from("rides")
      .select(rideSelect)
      .eq("status", "open")
      .gt("starts_at", new Date().toISOString())
      .order("starts_at", { ascending: true })
      .limit(30);
    if (error) throw error;
    return ((data ?? []) as unknown as RideRow[]).map(mapRide);
  }, { force });
  const now = Date.now();
  return rides.filter((ride) => ride.status === "open" && new Date(ride.startsAt).getTime() > now);
}

export async function createRide(input: {
  creatorId: string;
  title: string;
  description: string;
  startLabel: string;
  destinationLabel: string;
  startsAt: string;
  capacity: number;
  bannerImagePath?: string | null;
  startCoords?: AppCoords;
  destinationCoords?: AppCoords;
}): Promise<RideCardData> {
  const { start, destination, route } = await calculateRideMetrics(input.startLabel, input.destinationLabel, input.startCoords, input.destinationCoords);
  const { data, error } = await supabase.from("rides").insert({
    creator_id: input.creatorId,
    title: input.title,
    description: input.description,
    start_label: input.startLabel,
    destination_label: input.destinationLabel,
    starts_at: input.startsAt,
    distance_meters: Math.round(route.distanceKilometers * 1000),
    estimated_duration_minutes: route.estimatedDurationMinutes,
    route_data: { start, destination },
    capacity: input.capacity,
    banner_image_path: input.bannerImagePath ?? null,
    status: "open",
  }).select(rideSelect).single();
  if (error) throw error;
  const ride = mapRide(data as unknown as RideRow);
  await Promise.all([
    updateStored<RideCardData[]>(input.creatorId, openRidesKey, (rides) => [...rides, ride].sort((a, b) => a.startsAt.localeCompare(b.startsAt))),
    updateStored<RideCardData[]>(input.creatorId, userRidesKey, (rides) => [...rides, ride].sort((a, b) => a.startsAt.localeCompare(b.startsAt))),
    writeStored(input.creatorId, rideDetailsKey(ride.id), ride),
  ]);
  return ride;
}

export async function updateRideDetails(rideId: string, userId: string, input: {
  title: string;
  description: string;
  startLabel: string;
  destinationLabel: string;
  startsAt: string;
  capacity: number;
  bannerImagePath?: string | null;
  startCoords?: AppCoords;
  destinationCoords?: AppCoords;
}): Promise<RideCardData> {
  const { start, destination, route } = await calculateRideMetrics(input.startLabel, input.destinationLabel, input.startCoords, input.destinationCoords);
  const { error } = await supabase.rpc("update_ride_details", {
    p_ride_id: rideId,
    p_title: input.title,
    p_description: input.description,
    p_start_label: input.startLabel,
    p_destination_label: input.destinationLabel,
    p_starts_at: input.startsAt,
    p_capacity: input.capacity,
  });
  if (error) throw error;

  const { error: metricsError } = await supabase.from("rides").update({
    distance_meters: Math.round(route.distanceKilometers * 1000),
    estimated_duration_minutes: route.estimatedDurationMinutes,
    route_data: { start, destination },
    ...(input.bannerImagePath !== undefined ? { banner_image_path: input.bannerImagePath } : {}),
  }).eq("id", rideId).eq("creator_id", userId).select("id").single();
  if (metricsError) throw metricsError;

  const ride = await loadRideDetails(rideId, userId, true);
  if (!ride) throw new Error("The ride was updated but could not be reloaded.");
  const replaceRide = (rides: RideCardData[]) => {
    const exists = rides.some((item) => item.id === rideId);
    return (exists ? rides.map((item) => item.id === rideId ? ride : item) : [...rides, ride])
      .sort((a, b) => a.startsAt.localeCompare(b.startsAt));
  };
  await refreshStored(
    updateStored<RideCardData[]>(userId, openRidesKey, replaceRide),
    updateStored<RideCardData[]>(userId, userRidesKey, replaceRide),
    updateStored<ConversationData[]>(userId, conversationsKey, (rows) =>
      rows.map((row) => row.rideId === rideId ? { ...row, title: ride.title } : row)),
  );
  return ride;
}

export async function saveRideRouteMetrics(
  rideId: string,
  userId: string,
  route: Pick<RouteResult, "distanceKilometers" | "estimatedDurationMinutes"> & {
    start: AppCoords;
    destination: AppCoords;
  },
): Promise<void> {
  const distanceMeters = Math.round(route.distanceKilometers * 1000);
  const estimatedDurationMinutes = route.estimatedDurationMinutes;
  const { error } = await supabase.from("rides").update({
    distance_meters: distanceMeters,
    estimated_duration_minutes: estimatedDurationMinutes,
    route_data: { start: route.start, destination: route.destination },
  }).eq("id", rideId).eq("creator_id", userId).select("id").single();
  if (error) throw error;
  const updateMetrics = (ride: RideCardData | null) => ride
    ? {
      ...ride,
      distanceMeters,
      estimatedDurationMinutes,
      startCoords: route.start,
      destinationCoords: route.destination,
      distance: formatRideDistance(distanceMeters / 1000),
      duration: formatRideDuration(estimatedDurationMinutes),
    }
    : ride;
  await Promise.all([
    updateStored<RideCardData[]>(userId, openRidesKey, (rides) => rides.map((ride) => updateMetrics(ride) as RideCardData)),
    updateStored<RideCardData[]>(userId, userRidesKey, (rides) => rides.map((ride) => updateMetrics(ride) as RideCardData)),
    updateStored<RideCardData | null>(userId, rideDetailsKey(rideId), updateMetrics),
  ]);
}

export async function loadUserRideRequests(userId: string, force = false): Promise<RideRequestData[]> {
  return localFirst(userId, "user-ride-requests", async () => {
    const { data, error } = await supabase.from("ride_requests")
      .select("id, ride_id, status")
      .eq("user_id", userId)
      .in("status", ["pending", "approved", "declined", "cancelled"])
      .order("created_at", { ascending: false });
    if (error) throw error;
    return (data ?? []).map((request) => ({ id: request.id, rideId: request.ride_id, status: request.status as RideRequestStatus }));
  }, { force });
}

export async function requestRide(rideId: string, userId: string): Promise<RideRequestData> {
  const { data, error } = await supabase.from("ride_requests")
    .insert({ ride_id: rideId, user_id: userId, status: "pending" })
    .select("id, ride_id, status")
    .single();
  if (error) throw error;
  const created: RideRequestData = { id: data.id, rideId: data.ride_id, status: data.status as RideRequestStatus };
  await updateStored<RideRequestData[]>(userId, "user-ride-requests", (requests) => [created, ...requests]);
  return created;
}

export async function cancelRideRequest(requestId: string, userId: string): Promise<void> {
  const { error } = await supabase.rpc("cancel_ride_request", { p_request_id: requestId });
  if (error) throw error;
  await updateStored<RideRequestData[]>(userId, "user-ride-requests", (requests) => requests.map((request) => request.id === requestId ? { ...request, status: "cancelled" } : request));
}

export async function reviewRideRequest(requestId: string, decision: "approved" | "declined", adminId: string): Promise<void> {
  const { data, error } = await supabase.rpc("review_ride_request", { p_request_id: requestId, p_decision: decision });
  if (error) throw error;
  const reviewed = data as { user_id?: string; ride_id?: string } | null;
  await updateStored<AdminRequestData[]>(adminId, "pending-admin-requests-v2", (requests) => requests.filter((request) => request.id !== requestId));
  if (reviewed?.ride_id) {
    const rideId = reviewed.ride_id;
    await updateStored<AdminRequestData[]>(adminId, `ride-requests-v2:${rideId}`, (requests) => requests.filter((request) => request.id !== requestId));
    if (decision === "approved") await refreshStored(loadRideParticipants(rideId, adminId, true), loadConversations(adminId, true));
  }
}

export async function loadRideAdmins(rideIds: string[], userId: string, force = false): Promise<Record<string, RideAdminData[]>> {
  if (rideIds.length === 0) return {};
  const result: Record<string, RideAdminData[]> = {};
  const missing: string[] = [];
  for (const rideId of rideIds) {
    const stored = force ? undefined : await readStored<RideAdminData[]>(userId, `ride-admins:${rideId}`);
    if (stored) result[rideId] = stored;
    else missing.push(rideId);
  }
  if (missing.length === 0) return result;
  {
    const { data, error } = await supabase.from("ride_admins").select("ride_id, user_id, role").in("ride_id", missing);
    if (error) throw error;
    const names = new Map<string, string>();
    const userIds = [...new Set((data ?? []).map((row) => row.user_id))];
    if (userIds.length) {
      const { data: profiles, error: profileError } = await supabase.from("profiles").select("id, display_name").in("id", userIds);
      if (profileError) throw profileError;
      for (const profile of profiles ?? []) names.set(profile.id, profile.display_name);
    }
    const fetched: Record<string, RideAdminData[]> = Object.fromEntries(missing.map((rideId) => [rideId, [] as RideAdminData[]]));
    for (const row of data ?? []) {
      fetched[row.ride_id].push({ rideId: row.ride_id, userId: row.user_id, name: names.get(row.user_id) ?? "Rider", role: row.role as "owner" | "admin" });
    }
    await Promise.all(missing.map((rideId) => writeStored(userId, `ride-admins:${rideId}`, fetched[rideId])));
    Object.assign(result, fetched);
  }
  return result;
}

export async function assignRideAdmin(rideId: string, userId: string, assignedBy: string): Promise<void> {
  const { error } = await supabase.from("ride_admins").insert({ ride_id: rideId, user_id: userId, role: "admin", assigned_by: assignedBy });
  if (error) throw error;
  await refreshStored(loadRideAdmins([rideId], assignedBy, true));
}

export async function loadUserRides(userId: string, force = false): Promise<RideCardData[]> {
  const rides = await localFirst(userId, userRidesKey, async () => {
    await expireStaleRides();
    const [owned, administered, approved] = await Promise.all([
      supabase.from("rides").select("id").eq("creator_id", userId),
      supabase.from("ride_admins").select("ride_id").eq("user_id", userId),
      supabase.from("ride_requests").select("ride_id").eq("user_id", userId).eq("status", "approved"),
    ]);
    for (const result of [owned, administered, approved]) if (result.error) throw result.error;
    const ids = [...new Set([
      ...(owned.data ?? []).map((row) => row.id),
      ...(administered.data ?? []).map((row) => row.ride_id),
      ...(approved.data ?? []).map((row) => row.ride_id),
    ])];
    if (ids.length === 0) return [];
    const { data, error } = await supabase.from("rides").select(rideSelect).in("id", ids).order("starts_at", { ascending: true });
    if (error) throw error;
    return ((data ?? []) as unknown as RideRow[]).map(mapRide);
  }, { force });
  return rides.map((ride) => ride.status === "open" && new Date(ride.startsAt).getTime() + RIDE_EXPIRY_MS <= Date.now()
    ? { ...ride, status: "expired" }
    : ride);
}

export async function loadPendingAdminRequests(userId: string, force = false): Promise<AdminRequestData[]> {
  return localFirst(userId, "pending-admin-requests-v2", async () => {
    const { data: adminRows, error } = await supabase.from("ride_admins").select("ride_id").eq("user_id", userId);
    if (error) throw error;
    const rideIds = [...new Set((adminRows ?? []).map((row) => row.ride_id))];
    const rideRequests = await Promise.all(rideIds.map((rideId) => loadRideRequests(rideId, userId, force)));
    return rideRequests.flat().sort((left, right) => left.createdAt.localeCompare(right.createdAt));
  }, { force });
}

export async function loadNearbyRiders(_userId: string, _force = false): Promise<NearbyRiderData[]> {
  const { data, error } = await supabase.rpc("nearby_riders", { p_radius_meters: 25000, p_limit: 25 });
  if (error) throw error;
  return ((data ?? []) as { user_id: string; display_name: string; avatar_path: string | null; home_city: string | null; approximate_distance_km: number }[])
    .map((rider) => ({ id: rider.user_id, name: rider.display_name, avatarPath: rider.avatar_path, city: rider.home_city, distanceKm: rider.approximate_distance_km }));
}

export async function searchPublicUsers(query: string): Promise<PublicUserSearchData[]> {
  const normalizedQuery = query.trim();
  if (normalizedQuery.length < 2) return [];
  const { data, error } = await supabase.rpc("search_public_users", {
    p_query: normalizedQuery,
    p_limit: 25,
  });
  if (error) throw error;
  return ((data ?? []) as { user_id: string; display_name: string; avatar_path: string | null }[])
    .map((profile) => ({ id: profile.user_id, name: profile.display_name, avatarPath: profile.avatar_path }));
}

export async function loadFriendRequests(userId: string, force = false): Promise<FriendData[]> {
  return localFirst(userId, "friend-requests-v2", async () => {
    const { data, error } = await supabase.from("friend_requests")
      .select("id, requester_id, recipient_id, status")
      .or(`requester_id.eq.${userId},recipient_id.eq.${userId}`)
      .order("created_at", { ascending: false });
    if (error) throw error;
    if (!data?.length) return [];
    const otherIds = [...new Set(data.map((request) => request.requester_id === userId ? request.recipient_id : request.requester_id))];
    const { data: profiles, error: profileError } = await supabase.from("profiles").select("id, display_name, avatar_path").in("id", otherIds);
    if (profileError) throw profileError;
    const profileById = new Map((profiles ?? []).map((profile) => [profile.id, profile]));
    return data.map((request) => {
      const otherId = request.requester_id === userId ? request.recipient_id : request.requester_id;
      const profile = profileById.get(otherId);
      return { id: request.id, otherUserId: otherId, name: profile?.display_name ?? "Rider", avatarPath: profile?.avatar_path ?? null, status: request.status, direction: request.requester_id === userId ? "outgoing" : "incoming" };
    });
  }, { force });
}

export async function createFriendRequest(requesterId: string, recipientId: string): Promise<void> {
  const { error } = await supabase.from("friend_requests").insert({ requester_id: requesterId, recipient_id: recipientId, status: "pending" });
  if (error) throw error;
  await refreshStored(loadFriendRequests(requesterId, true));
}

export async function respondToFriendRequest(requestId: string, accept: boolean, userId: string): Promise<void> {
  const { error } = await supabase.rpc("respond_to_friend_request", { p_request_id: requestId, p_accept: accept });
  if (error) throw error;
  await updateStored<FriendData[]>(userId, "friend-requests-v2", (friends) => friends.map((friend) => friend.id === requestId ? { ...friend, status: accept ? "accepted" : "declined" } : friend));
}

export type BlockedUserData = {
  id: string;
  name: string;
  avatarPath: string | null;
};

export async function loadBlockedUsers(): Promise<BlockedUserData[]> {
  const { data, error } = await supabase.rpc("blocked_users");
  if (error) throw error;
  return ((data ?? []) as { user_id: string; display_name: string; avatar_path: string | null }[])
    .map((row) => ({ id: row.user_id, name: row.display_name, avatarPath: row.avatar_path }));
}

export async function blockUser(userId: string): Promise<void> {
  const { error } = await supabase.rpc("block_user", { p_user_id: userId });
  if (error) throw error;
}

export async function unblockUser(userId: string): Promise<void> {
  const { error } = await supabase.rpc("unblock_user", { p_user_id: userId });
  if (error) throw error;
}

export async function createDirectConversation(otherUserId: string, currentUserId: string): Promise<string> {
  const { data, error } = await supabase.rpc("create_direct_conversation", { p_other_user_id: otherUserId });
  if (error) throw error;
  const { error: restoreError } = await supabase.rpc("restore_conversation", { p_conversation_id: data });
  if (restoreError) throw restoreError;
  await refreshStored(loadConversations(currentUserId, true));
  return data;
}

export async function restoreConversation(conversationId: string): Promise<void> {
  const { error } = await supabase.rpc("restore_conversation", { p_conversation_id: conversationId });
  if (error) throw error;
}

export async function createGroupConversation(userIds: string[], groupName: string, currentUserId: string): Promise<string> {
  const { data, error } = await supabase.rpc("create_group_conversation", {
    p_user_ids: userIds,
    p_group_name: groupName,
  });
  if (error) throw error;
  await refreshStored(loadConversations(currentUserId, true));
  return data;
}

export async function addGroupConversationMembers(conversationId: string, userIds: string[], currentUserId: string): Promise<void> {
  const { error } = await supabase.rpc("add_group_conversation_members", {
    p_conversation_id: conversationId,
    p_user_ids: userIds,
  });
  if (error) throw error;
  await refreshStored(
    loadConversations(currentUserId, true),
    loadConversationParticipants(conversationId, currentUserId, true),
  );
}

export async function updateConversationPreferences(
  userId: string,
  conversationId: string,
  options: {
    updateMute?: boolean;
    mutedUntil?: string | null;
    mutedForever?: boolean;
    background?: ChatBackground;
    clearChat?: boolean;
    deleteChat?: boolean;
  },
): Promise<void> {
  if (options.clearChat || options.deleteChat) {
    const key = `${userId}:${conversationId}`;
    messageClearEpoch.set(key, (messageClearEpoch.get(key) ?? 0) + 1);
  }
  const { error } = await supabase.rpc("update_conversation_preferences", {
    p_conversation_id: conversationId,
    p_update_mute: options.updateMute ?? false,
    p_muted_until: options.mutedUntil ?? null,
    p_muted_forever: options.mutedForever ?? false,
    p_background: options.background ?? null,
    p_clear_chat: options.clearChat ?? false,
    p_delete_chat: options.deleteChat ?? false,
  });
  if (error) throw error;
  if (options.clearChat || options.deleteChat) {
    await writeStored<MessageData[]>(userId, `messages:${conversationId}`, []);
  }
  await updateStored<ConversationData[]>(userId, conversationsKey, (rows) => {
    if (options.deleteChat) return rows.filter((row) => row.id !== conversationId);
    return rows.map((row) => row.id === conversationId ? {
      ...row,
      ...(options.updateMute ? {
        mutedUntil: options.mutedUntil ?? null,
        mutedForever: options.mutedForever ?? false,
      } : {}),
      ...(options.background ? { background: options.background } : {}),
      ...(options.clearChat ? { lastMessage: "No messages yet", clearedAt: new Date().toISOString() } : {}),
    } : row);
  });
}

export async function leaveGroupConversation(userId: string, conversationId: string, deleteChat: boolean): Promise<void> {
  const { error } = await supabase.rpc("leave_group_conversation", {
    p_conversation_id: conversationId,
    p_delete_chat: deleteChat,
  });
  if (error) throw error;
  await Promise.all([
    removeStored(userId, `messages:${conversationId}`),
    updateStored<ConversationData[]>(userId, conversationsKey, (rows) => rows.filter((row) => row.id !== conversationId)),
  ]);
}

export async function clearConversationMessages(userId: string, conversationId: string): Promise<void> {
  await updateConversationPreferences(userId, conversationId, { clearChat: true });
}

export async function setConversationActive(conversationId: string, sessionId: string, active: boolean): Promise<void> {
  const { error } = await supabase.rpc("set_active_conversation", {
    p_conversation_id: conversationId,
    p_session_id: sessionId,
    p_active: active,
  });
  if (error) throw error;
}

export async function markConversationRead(conversationId: string, userId: string, readThrough: string): Promise<void> {
  const { error } = await supabase.rpc("mark_conversation_read", {
    p_conversation_id: conversationId,
    p_read_through: readThrough,
  });
  if (error) throw error;
  await updateStored<ConversationData[]>(userId, conversationsKey, (rows) =>
    rows.map((row) => row.id === conversationId ? { ...row, unreadCount: 0 } : row));
}

async function loadMessageDeliveryStatuses(userId: string, messageIds: string[]): Promise<Map<string, MessageDeliveryStatus>> {
  if (!messageIds.length) return new Map();
  const statuses = new Map<string, MessageDeliveryStatus>();
  for (let offset = 0; offset < messageIds.length; offset += 200) {
    const { data, error } = await supabase.from("message_receipts")
      .select("message_id, recipient_id, delivered_at, read_at")
      .eq("sender_id", userId)
      .in("message_id", messageIds.slice(offset, offset + 200));
    if (error) throw error;
    const counts = new Map<string, { recipients: number; delivered: number; read: number }>();
    for (const receipt of data ?? []) {
      const count = counts.get(receipt.message_id) ?? { recipients: 0, delivered: 0, read: 0 };
      count.recipients += 1;
      if (receipt.delivered_at) count.delivered += 1;
      if (receipt.read_at) count.read += 1;
      counts.set(receipt.message_id, count);
    }
    for (const [messageId, count] of counts) {
      statuses.set(messageId, count.read === count.recipients && count.recipients > 0
        ? "read"
        : count.delivered === count.recipients && count.recipients > 0 ? "delivered" : "sent");
    }
  }
  return statuses;
}

async function acknowledgeMessagesDelivered(conversationId: string, userId: string, messages: MessageData[]): Promise<void> {
  const messageIds = messages.filter((message) => message.senderId !== userId).map((message) => message.id);
  for (let offset = 0; offset < messageIds.length; offset += 200) {
    const { error } = await supabase.rpc("acknowledge_messages_delivered", {
      p_conversation_id: conversationId,
      p_message_ids: messageIds.slice(offset, offset + 200),
    });
    if (error) throw error;
  }
}

async function addDeliveryStatuses(userId: string, messages: MessageData[]): Promise<MessageData[]> {
  const outgoing = messages.filter((message) => message.senderId === userId);
  const statuses = await loadMessageDeliveryStatuses(userId, outgoing.map((message) => message.id));
  return messages.map((message) => message.senderId === userId
    ? { ...message, deliveryStatus: statuses.get(message.id) ?? "sent" }
    : message);
}

export async function loadConversations(userId: string, force = false): Promise<ConversationData[]> {
  return localFirst(userId, conversationsKey, async () => {
  const { data: memberships, error } = await supabase.from("conversation_members")
    .select("conversation_id, conversation:conversations(id, kind, ride_id, group_name, direct_user_low, direct_user_high, created_at)")
    .eq("user_id", userId);
  if (error) throw error;
  const conversations = (memberships ?? []).flatMap((row) => Array.isArray(row.conversation) ? row.conversation : row.conversation ? [row.conversation] : []) as unknown as {
    id: string; kind: "direct" | "ride" | "group"; ride_id: string | null; group_name: string | null; direct_user_low: string | null;
    direct_user_high: string | null; created_at: string;
  }[];
  if (conversations.length === 0) return [];

  const rideIds = conversations.flatMap((conversation) => conversation.ride_id ? [conversation.ride_id] : []);
  const directPeerIds = [...new Set(conversations.flatMap((conversation) => {
    if (conversation.kind !== "direct") return [];
    const peerId = conversation.direct_user_low === userId ? conversation.direct_user_high : conversation.direct_user_low;
    return peerId ? [peerId] : [];
  }))];
  const conversationIds = conversations.map((conversation) => conversation.id);
  const [ridesResult, peersResult, messagesResult, unreadResult, settingsResult] = await Promise.all([
    rideIds.length     ? supabase.from("rides").select("id, title, banner_image_path").in("id", rideIds) : Promise.resolve({ data: [], error: null }),
    directPeerIds.length ? supabase.from("profiles").select("id, display_name, avatar_path").in("id", directPeerIds) : Promise.resolve({ data: [], error: null }),
    supabase.from("messages").select("id, conversation_id, sender_id, body, attachment_path, attachment_name, created_at").in("conversation_id", conversationIds).order("created_at", { ascending: false }).limit(100),
    supabase.rpc("unread_conversation_counts"),
    supabase.from("conversation_user_settings")
      .select("conversation_id, muted_until, muted_forever, background, cleared_at, hidden_at")
      .eq("user_id", userId)
      .in("conversation_id", conversationIds),
  ]);
  if (ridesResult.error) throw ridesResult.error;
  if (peersResult.error) throw peersResult.error;
  if (messagesResult.error) throw messagesResult.error;
  if (unreadResult.error) throw unreadResult.error;
  if (settingsResult.error) throw settingsResult.error;
  const rideTitles = new Map((ridesResult.data ?? []).map((ride) => [ride.id, ride.title]));
  const rideBannerPaths = new Map((ridesResult.data ?? []).map((ride) => [ride.id, ride.banner_image_path]));
  const peerNames = new Map((peersResult.data ?? []).map((profile) => [profile.id, profile.display_name]));
  const peerAvatarPaths = new Map((peersResult.data ?? []).map((profile) => [profile.id, profile.avatar_path]));
  const unreadCounts = new Map(((unreadResult.data ?? []) as { conversation_id: string; unread_count: number | string }[])
    .map((row) => [row.conversation_id, Number(row.unread_count)]));
  const settingsByConversation = new Map((settingsResult.data ?? []).map((row) => [row.conversation_id, row]));
  const latestMessages = new Map<string, { id: string; sender_id: string; body: string; attachment_path: string | null; attachment_name: string | null; created_at: string }>();
  for (const message of messagesResult.data ?? []) if (!latestMessages.has(message.conversation_id)) latestMessages.set(message.conversation_id, message);
  await Promise.all([...latestMessages.entries()]
    .filter(([, message]) => message.sender_id !== userId)
    .map(([conversationId, message]) => acknowledgeMessagesDelivered(conversationId, userId, [{
      id: message.id, senderId: message.sender_id, body: message.body, createdAt: message.created_at,
      replyToMessageId: null, attachmentPath: message.attachment_path, attachmentName: message.attachment_name,
      attachmentMimeType: null, isForwarded: false,
    }])));
  const latestSenderIds = [...new Set([...latestMessages.values()]
    .map((message) => message.sender_id)
    .filter((senderId) => senderId !== userId))];
  const { data: latestSenders, error: senderError } = latestSenderIds.length
    ? await supabase.from("profiles").select("id, display_name").in("id", latestSenderIds)
    : { data: [], error: null };
  if (senderError) throw senderError;
  const latestSenderNames = new Map((latestSenders ?? []).map((profile) => [profile.id, profile.display_name]));
  const missingSenderNames = conversations.flatMap((conversation) => {
    const latest = latestMessages.get(conversation.id);
    return latest && latest.sender_id !== userId && !latestSenderNames.has(latest.sender_id)
      ? [{ conversationId: conversation.id, senderId: latest.sender_id }]
      : [];
  });
  const participantSenderNames = await Promise.all(missingSenderNames.map(async ({ conversationId, senderId }) => {
    const participants = await loadConversationParticipants(conversationId, userId);
    return [senderId, participants.find((participant) => participant.userId === senderId)?.displayName] as const;
  }));
  for (const [senderId, name] of participantSenderNames) if (name) latestSenderNames.set(senderId, name);
  const ownLatestMessageIds = [...latestMessages.entries()]
    .filter(([, message]) => message.sender_id === userId)
    .map(([, message]) => message);
  const latestDeliveryStatuses = await loadMessageDeliveryStatuses(userId, ownLatestMessageIds.map((message) => message.id));
  return conversations
    .filter((conversation) => !settingsByConversation.get(conversation.id)?.hidden_at)
    .map((conversation) => {
    const settings = settingsByConversation.get(conversation.id);
    const latestMessage = latestMessages.get(conversation.id);
    const latestVisibleMessage = latestMessage
      && (!settings?.cleared_at || latestMessage.created_at > settings.cleared_at)
      ? latestMessage
      : undefined;
    const peerId = conversation.direct_user_low === userId ? conversation.direct_user_high : conversation.direct_user_low;
    return ({
    id: conversation.id,
    kind: conversation.kind,
    rideId: conversation.ride_id,
    otherUserId: conversation.kind === "direct" ? (conversation.direct_user_low === userId ? conversation.direct_user_high : conversation.direct_user_low) : null,
    avatarPath: conversation.kind === "direct"
      ? peerAvatarPaths.get(conversation.direct_user_low === userId ? conversation.direct_user_high ?? "" : conversation.direct_user_low ?? "") ?? null
      : null,
    bannerImagePath: conversation.kind === "ride" && conversation.ride_id
      ? rideBannerPaths.get(conversation.ride_id) ?? null
      : null,
    title: conversation.kind === "ride" && conversation.ride_id
      ? rideTitles.get(conversation.ride_id) ?? "Ride chat"
      : conversation.kind === "group" ? conversation.group_name ?? "Group chat"
        : peerNames.get(peerId ?? "") ?? "Friend chat",
    detail: conversation.kind === "direct" ? "Direct conversation" : "Group conversation",
    lastMessage: latestVisibleMessage?.attachment_path
      ? latestVisibleMessage.body === "Photo" || latestVisibleMessage.body === "Attachment"
        ? latestVisibleMessage.attachment_name ?? latestVisibleMessage.body
        : latestVisibleMessage.body
      : latestVisibleMessage?.body ?? "No messages yet",
    lastMessageSender: !latestVisibleMessage ? null
      : latestVisibleMessage.sender_id === userId ? "You"
        : latestSenderNames.get(latestVisibleMessage.sender_id)
          ?? peerNames.get(latestVisibleMessage.sender_id)
          ?? "Rider",
    lastMessageStatus: latestVisibleMessage?.sender_id === userId
      ? latestDeliveryStatuses.get(latestVisibleMessage.id) ?? "sent"
      : null,
    updatedAt: latestVisibleMessage?.created_at ?? conversation.created_at,
    unreadCount: unreadCounts.get(conversation.id) ?? 0,
    mutedUntil: settings?.muted_until ?? null,
    mutedForever: settings?.muted_forever ?? false,
    background: (settings?.background ?? "default") as ChatBackground,
    clearedAt: settings?.cleared_at ?? null,
  });
  }).sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
  }, { force });
}

 
export async function loadRideDetails(rideId: string, userId: string, force = false): Promise<RideCardData | null> {
  const ride = await localFirst(userId, rideDetailsKey(rideId), async () => {
    await expireStaleRides();
    const { data, error } = await supabase.from("rides").select(rideSelect).eq("id", rideId).maybeSingle();
    if (error) throw error;
    return data ? mapRide(data as unknown as RideRow) : null;
  }, { force });
  return ride && ride.status === "open" && new Date(ride.startsAt).getTime() + RIDE_EXPIRY_MS <= Date.now()
    ? { ...ride, status: "expired" }
    : ride;
}

export async function loadRideParticipants(rideId: string, userId: string, force = false): Promise<RideParticipantData[]> {
  return localFirst(userId, `ride-participants:${rideId}`, async () => {
    const { data, error } = await supabase.rpc("ride_participants", { p_ride_id: rideId });
    if (error) throw error;
    return ((data ?? []) as { user_id: string; display_name: string; avatar_path: string | null; role: RideParticipantData["role"] }[])
      .map((person) => ({ userId: person.user_id, displayName: person.display_name, avatarPath: person.avatar_path, role: person.role }));
  }, { force });
}

export async function loadRideRequests(rideId: string, userId: string, force = false): Promise<AdminRequestData[]> {
  return localFirst(userId, `ride-requests-v2:${rideId}`, async () => {
    const [{ data: requests, error }, { data: ride, error: rideError }] = await Promise.all([
      supabase.rpc("ride_requests_for_ride", { p_ride_id: rideId }),
      supabase.from("rides").select("title").eq("id", rideId).maybeSingle(),
    ]);
    if (error) throw error;
    if (rideError) throw rideError;
    return ((requests ?? []) as { id: string; ride_id: string; user_id: string; rider_name: string; avatar_path: string | null; message: string; created_at: string }[]).map((request) => ({
      id: request.id,
      rideId: request.ride_id,
      rideTitle: ride?.title ?? "Ride",
      riderName: request.rider_name ?? "Rider",
      avatarPath: request.avatar_path,
      message: request.message,
      createdAt: request.created_at,
    }));
  }, { force });
}

export async function cancelRide(rideId: string, userId: string): Promise<void> {
  const { error } = await supabase.rpc("cancel_ride", { p_ride_id: rideId });
  if (error) throw error;
  const markCancelled = (rides: RideCardData[]) => rides.map((ride) => ride.id === rideId ? { ...ride, status: "cancelled" as const } : ride);
  await Promise.all([
    updateStored<RideCardData[]>(userId, openRidesKey, (rides) => rides.filter((ride) => ride.id !== rideId)),
    updateStored<RideCardData[]>(userId, userRidesKey, markCancelled),
    updateStored<RideCardData | null>(userId, rideDetailsKey(rideId), (ride) => ride && { ...ride, status: "cancelled" }),
    writeStored(userId, `ride-requests-v2:${rideId}`, [] as AdminRequestData[]),
  ]);
  await updateStored<AdminRequestData[]>(userId, "pending-admin-requests-v2", (requests) => requests.filter((request) => request.rideId !== rideId));
}

async function updateRideStatusCache(rideId: string, userId: string, status: RideCardData["status"]): Promise<void> {
  const updateRide = (ride: RideCardData | null) => ride?.id === rideId ? { ...ride, status } : ride;
  await refreshStored(
    updateStored<RideCardData[]>(userId, openRidesKey, (rides) => rides.filter((ride) => ride.id !== rideId)),
    updateStored<RideCardData[]>(userId, userRidesKey, (rides) => rides.map((ride) => updateRide(ride) as RideCardData)),
    updateStored<RideCardData | null>(userId, rideDetailsKey(rideId), updateRide),
  );
}

export async function startRide(rideId: string, userId: string): Promise<void> {
  const { error } = await supabase.rpc("start_ride", { p_ride_id: rideId });
  if (error) throw error;
  await updateRideStatusCache(rideId, userId, "started");
  await refreshStored(
    writeStored(userId, `ride-requests-v2:${rideId}`, [] as AdminRequestData[]),
    updateStored<AdminRequestData[]>(userId, "pending-admin-requests-v2", (requests) => requests.filter((request) => request.rideId !== rideId)),
  );
}

export async function endRide(rideId: string, userId: string): Promise<void> {
  const { error } = await supabase.rpc("end_ride", { p_ride_id: rideId });
  if (error) throw error;
  await updateRideStatusCache(rideId, userId, "completed");
}

export async function leaveRide(rideId: string, userId: string): Promise<void> {
  const { error } = await supabase.rpc("leave_ride", { p_ride_id: rideId });
  if (error) throw error;
  await Promise.all([
    updateStored<RideCardData[]>(userId, userRidesKey, (rides) => rides.filter((ride) => ride.id !== rideId)),
    updateStored<RideRequestData[]>(userId, "user-ride-requests", (requests) => requests.map((request) => request.rideId === rideId && request.status === "approved" ? { ...request, status: "cancelled" } : request)),
    updateStored<RideParticipantData[]>(userId, `ride-participants:${rideId}`, (people) => people.filter((person) => person.userId !== userId)),
    updateStored<ConversationData[]>(userId, conversationsKey, (rows) => rows.filter((row) => row.rideId !== rideId)),
  ]);
}

export async function loadConversationParticipants(conversationId: string, userId: string, force = false): Promise<ConversationParticipantData[]> {
  return localFirst(userId, `conversation-participants:${conversationId}`, async () => {
    const { data, error } = await supabase.rpc("conversation_participants", { p_conversation_id: conversationId });
    if (error) throw error;
    return ((data ?? []) as { user_id: string; display_name: string; avatar_path: string | null; joined_at: string }[])
      .map((person) => ({ userId: person.user_id, displayName: person.display_name, avatarPath: person.avatar_path, joinedAt: person.joined_at }));
  }, { force });
}

export async function loadSharedActiveRides(otherUserId: string, userId: string, force = false): Promise<SharedRideData[]> {
  return localFirst(userId, `shared-rides-v2:${otherUserId}`, async () => {
    const { data, error } = await supabase.rpc("shared_active_rides", { p_other_user_id: otherUserId });
    if (error) throw error;
    return ((data ?? []) as {
      id: string;
      title: string;
      start_label: string;
      destination_label: string;
      starts_at: string;
      distance_meters?: number | null;
      estimated_duration_minutes?: number | null;
    }[]).map((ride) => ({
      id: ride.id,
      title: ride.title,
      route: `${ride.start_label} → ${ride.destination_label}`,
      startsAt: ride.starts_at,
      distance: ride.distance_meters == null ? "Route distance not set" : formatRideDistance(ride.distance_meters / 1000),
      duration: ride.estimated_duration_minutes == null ? "Time not set" : formatRideDuration(ride.estimated_duration_minutes),
    }));
  }, { force });
}

export async function loadMessages(conversationId: string, userId: string, force = false): Promise<MessageData[]> {
  const { data: settings, error: settingsError } = await supabase.from("conversation_user_settings")
    .select("cleared_at")
    .eq("user_id", userId)
    .eq("conversation_id", conversationId)
    .maybeSingle();
  if (settingsError) throw settingsError;
  const clearedAt = settings?.cleared_at ?? null;
  const messages = await localFirst(userId, `messages:${conversationId}`, async () => {
    let query = supabase.from("messages")
      .select("id, sender_id, body, created_at, reply_to_message_id, attachment_path, attachment_name, attachment_mime_type, is_forwarded")
      .eq("conversation_id", conversationId)
      .order("created_at", { ascending: true });
    if (clearedAt) query = query.gt("created_at", clearedAt);
    const { data, error } = await query;
    if (error) throw error;
    return (data ?? []).map((message) => ({
      id: message.id,
      senderId: message.sender_id,
      body: message.body,
      createdAt: message.created_at,
      replyToMessageId: message.reply_to_message_id,
      attachmentPath: message.attachment_path,
      attachmentName: message.attachment_name,
      attachmentMimeType: message.attachment_mime_type,
      isForwarded: message.is_forwarded,
    }));
  }, { force });
  const visibleMessages = clearedAt
    ? messages.filter((message) => message.createdAt > clearedAt)
    : messages;
  if (visibleMessages.length !== messages.length) {
    await writeStored(userId, `messages:${conversationId}`, visibleMessages);
  }
  const withAttachmentUrls = await Promise.all(visibleMessages.map(async (message) => ({
    ...message,
    attachmentUrl: message.attachmentPath
      && getAttachmentKind(message.attachmentMimeType, message.attachmentName, message.attachmentPath) === "image"
      ? await getMessageImageUrl(message.attachmentPath)
      : null,
  })));
  try {
    await acknowledgeMessagesDelivered(conversationId, userId, visibleMessages);
    const updated = await addDeliveryStatuses(userId, visibleMessages);
    if (JSON.stringify(updated) !== JSON.stringify(visibleMessages)) {
      await writeStored(userId, `messages:${conversationId}`, updated);
    }
    return withAttachmentUrls.map((message) => ({
      ...message,
      deliveryStatus: updated.find((item) => item.id === message.id)?.deliveryStatus,
    }));
  } catch (error) {
    console.warn("[chat] Could not refresh message delivery status", error);
    return withAttachmentUrls;
  }
}

export async function loadConversationAttachments(conversationId: string, userId: string): Promise<SharedAttachmentData[]> {
  const { data: settings, error: settingsError } = await supabase.from("conversation_user_settings")
    .select("cleared_at")
    .eq("user_id", userId)
    .eq("conversation_id", conversationId)
    .maybeSingle();
  if (settingsError) throw settingsError;
  const attachments: SharedAttachmentData[] = [];
  const pageSize = 500;
  for (let offset = 0; ; offset += pageSize) {
    let query = supabase.from("messages")
      .select("id, attachment_path, attachment_name, attachment_mime_type, created_at")
      .eq("conversation_id", conversationId)
      .not("attachment_path", "is", null)
      .order("created_at", { ascending: false })
      .order("id", { ascending: false });
    if (settings?.cleared_at) query = query.gt("created_at", settings.cleared_at);
    const { data, error } = await query.range(offset, offset + pageSize - 1);
    if (error) throw error;
    const rows = data ?? [];
    attachments.push(...rows.flatMap((message) => {
      if (!message.attachment_path) return [];
      const kind = getAttachmentKind(message.attachment_mime_type, message.attachment_name, message.attachment_path);
      const fallbackName = kind === "image" ? "Photo" : kind === "video" ? "Video"
        : kind === "audio" ? "Audio" : message.attachment_path.split("/").pop() ?? "Attachment";
      return [{
        id: message.id,
        attachmentPath: message.attachment_path,
        attachmentName: message.attachment_name ?? fallbackName,
        attachmentMimeType: message.attachment_mime_type,
        createdAt: message.created_at,
        kind,
      }];
    }));
    if (rows.length < pageSize) return attachments;
  }
}

export async function loadConversationAttachment(
  conversationId: string,
  userId: string,
  messageId: string,
): Promise<SharedAttachmentData & { signedUrl: string }> {
  const { data: settings, error: settingsError } = await supabase.from("conversation_user_settings")
    .select("cleared_at")
    .eq("user_id", userId)
    .eq("conversation_id", conversationId)
    .maybeSingle();
  if (settingsError) throw settingsError;
  let query = supabase.from("messages")
    .select("id, attachment_path, attachment_name, attachment_mime_type, created_at")
    .eq("id", messageId)
    .eq("conversation_id", conversationId)
    .not("attachment_path", "is", null);
  if (settings?.cleared_at) query = query.gt("created_at", settings.cleared_at);
  const { data, error } = await query.maybeSingle();
  if (error) throw error;
  if (!data?.attachment_path) throw new Error("This attachment is no longer available.");
  const kind = getAttachmentKind(data.attachment_mime_type, data.attachment_name, data.attachment_path);
  const fallbackName = kind === "image" ? "Photo" : kind === "video" ? "Video"
    : kind === "audio" ? "Audio" : data.attachment_path.split("/").pop() ?? "Attachment";
  return {
    id: data.id,
    attachmentPath: data.attachment_path,
    attachmentName: data.attachment_name ?? fallbackName,
    attachmentMimeType: data.attachment_mime_type,
    createdAt: data.created_at,
    kind,
    signedUrl: await getMessageImageUrl(data.attachment_path),
  };
}

// Fetches only messages newer than what is stored and appends them.
export async function syncMessages(conversationId: string, userId: string): Promise<void> {
  const clearEpochKey = `${userId}:${conversationId}`;
  const startingClearEpoch = messageClearEpoch.get(clearEpochKey) ?? 0;
  const [{ data: settings, error: settingsError }, cachedMessages] = await Promise.all([
    supabase.from("conversation_user_settings")
      .select("cleared_at")
      .eq("user_id", userId)
      .eq("conversation_id", conversationId)
      .maybeSingle(),
    readStored<MessageData[]>(userId, `messages:${conversationId}`),
  ]);
  if (settingsError) throw settingsError;
  const clearedAt = settings?.cleared_at ?? null;
  const stored = cachedMessages === undefined || !clearedAt
    ? cachedMessages
    : cachedMessages.filter((message) => message.createdAt > clearedAt);
  if (stored && cachedMessages && stored.length !== cachedMessages.length) {
    await writeStored(userId, `messages:${conversationId}`, stored);
  }
  if (!stored) {
    await loadMessages(conversationId, userId, true);
    if ((messageClearEpoch.get(clearEpochKey) ?? 0) !== startingClearEpoch) {
      await loadMessages(conversationId, userId, true);
    }
    return;
  }
  const last = stored[stored.length - 1]?.createdAt;
  let query = supabase.from("messages").select("id, sender_id, body, created_at, reply_to_message_id, attachment_path, attachment_name, attachment_mime_type, is_forwarded").eq("conversation_id", conversationId).order("created_at", { ascending: true });
  if (clearedAt) query = query.gt("created_at", clearedAt);
  if (last) query = query.gte("created_at", last);
  const { data, error } = await query;
  if (error) throw error;
  const known = new Set(stored.map((message) => message.id));
  const fresh = data.filter((message) => !known.has(message.id)).map((message) => ({
    id: message.id,
    senderId: message.sender_id,
    body: message.body,
    createdAt: message.created_at,
    replyToMessageId: message.reply_to_message_id,
    attachmentPath: message.attachment_path,
    attachmentName: message.attachment_name,
    attachmentMimeType: message.attachment_mime_type,
    isForwarded: message.is_forwarded,
  }));
  const combined = [...stored, ...fresh].sort((left, right) => left.createdAt.localeCompare(right.createdAt));
  await acknowledgeMessagesDelivered(conversationId, userId, fresh);
  const updated = await addDeliveryStatuses(userId, combined);
  if ((messageClearEpoch.get(clearEpochKey) ?? 0) !== startingClearEpoch) return;
  if (JSON.stringify(updated) !== JSON.stringify(stored)) {
    await writeStored(userId, `messages:${conversationId}`, updated);
  }
}

export async function sendMessage(
  conversationId: string,
  senderId: string,
  body: string,
  options: {
    replyToMessageId?: string | null;
    attachmentPath?: string | null;
    attachmentName?: string | null;
    attachmentMimeType?: string | null;
    isForwarded?: boolean;
  } = {},
): Promise<MessageData> {
  const { data, error } = await supabase.from("messages")
    .insert({
      conversation_id: conversationId,
      sender_id: senderId,
      body: body.trim() || (options.attachmentPath
        ? options.attachmentMimeType?.startsWith("image/") ? "Photo" : "Attachment"
        : ""),
      reply_to_message_id: options.replyToMessageId ?? null,
      attachment_path: options.attachmentPath ?? null,
      attachment_name: options.attachmentName ?? null,
      attachment_mime_type: options.attachmentMimeType ?? null,
      is_forwarded: options.isForwarded ?? false,
    })
    .select("id, sender_id, body, created_at, reply_to_message_id, attachment_path, attachment_name, attachment_mime_type, is_forwarded")
    .single();
  if (error) throw error;
  const message: MessageData = {
    id: data.id,
    senderId: data.sender_id,
    body: data.body,
    createdAt: data.created_at,
    replyToMessageId: data.reply_to_message_id,
    attachmentPath: data.attachment_path,
    attachmentName: data.attachment_name,
    attachmentMimeType: data.attachment_mime_type,
    isForwarded: data.is_forwarded,
    attachmentUrl: data.attachment_path
      && getAttachmentKind(data.attachment_mime_type, data.attachment_name, data.attachment_path) === "image"
      ? await getMessageImageUrl(data.attachment_path)
      : null,
    deliveryStatus: "sent",
  };
  const storedMessage = { ...message };
  delete storedMessage.attachmentUrl;
  await updateStored<MessageData[]>(senderId, `messages:${conversationId}`, (thread) => thread.some((item) => item.id === message.id) ? thread : [...thread, storedMessage]);
  await updateStored<ConversationData[]>(senderId, conversationsKey, (rows) => rows.map((row) => row.id === conversationId
    ? { ...row, lastMessage: message.body, lastMessageSender: "You", lastMessageStatus: "sent", updatedAt: message.createdAt }
    : row));
  return message;
}

export async function loadProfile(userId: string, force = false): Promise<ProfileData | null> {
  return localFirst(userId, profileKey, async () => {
    const { data, error } = await supabase.from("profiles")
      .select("id, display_name, avatar_path, home_city, bio, riding_pace, discoverable")
      .eq("id", userId)
      .maybeSingle();
    if (error) throw error;
    return data ? { id: data.id, displayName: data.display_name, avatarPath: data.avatar_path, homeCity: data.home_city, bio: data.bio, ridingPace: data.riding_pace, discoverable: data.discoverable } : null;
  }, { force });
}

export async function loadPublicProfile(targetUserId: string, viewerId: string, force = false): Promise<PublicProfileData | null> {
  return localFirst(viewerId, `public-profile-v2:${targetUserId}`, async () => {
    const { data, error } = await supabase.rpc("public_profile", { p_user_id: targetUserId });
    if (error) throw error;
    const profile = ((data ?? []) as { id: string; display_name: string; avatar_path: string | null; home_city: string | null; bio: string; riding_pace: string }[])[0];
    return profile ? { id: profile.id, displayName: profile.display_name, avatarPath: profile.avatar_path, homeCity: profile.home_city, bio: profile.bio, ridingPace: profile.riding_pace } : null;
  }, { force });
}

export async function updateProfile(input: Omit<ProfileData, "id" | "avatarPath"> & { id: string }): Promise<ProfileData> {
  const { data, error } = await supabase.from("profiles").update({
    display_name: input.displayName,
    home_city: input.homeCity,
    bio: input.bio,
    riding_pace: input.ridingPace,
    discoverable: input.discoverable,
  }).eq("id", input.id).select("id, display_name, avatar_path, home_city, bio, riding_pace, discoverable").single();
  if (error) throw error;
  const profile: ProfileData = { id: data.id, displayName: data.display_name, avatarPath: data.avatar_path, homeCity: data.home_city, bio: data.bio, ridingPace: data.riding_pace, discoverable: data.discoverable };
  await writeStored(input.id, profileKey, profile);
  return profile;
}

export async function updateProfileDiscoverable(userId: string, discoverable: boolean): Promise<ProfileData> {
  const { data, error } = await supabase.from("profiles")
    .update({ discoverable })
    .eq("id", userId)
    .select("id, display_name, avatar_path, home_city, bio, riding_pace, discoverable")
    .single();
  if (error) throw error;
  const profile: ProfileData = {
    id: data.id,
    displayName: data.display_name,
    avatarPath: data.avatar_path,
    homeCity: data.home_city,
    bio: data.bio,
    ridingPace: data.riding_pace,
    discoverable: data.discoverable,
  };
  await writeStored(userId, profileKey, profile);
  return profile;
}

export function getImagePublicUrl(bucket: "profile-images" | "ride-banners", path: string | null): string | null {
  if (!path) return null;
  if (/^https?:\/\//i.test(path)) return path;
  return supabase.storage.from(bucket).getPublicUrl(path).data.publicUrl;
}

async function uploadImage(bucket: "profile-images" | "ride-banners", path: string, asset: ImageUploadAsset): Promise<string> {
  const response = await fetch(asset.uri);
  if (!response.ok) throw new Error("Could not read the selected image.");
  const image = await response.arrayBuffer();
  if (image.byteLength > 8 * 1024 * 1024) throw new Error("Choose an image smaller than 8 MB.");
  const contentType = (asset.mimeType || response.headers.get("content-type")?.split(";")[0] || "").toLowerCase();
  const extension = contentType === "image/jpeg" ? "jpg"
    : contentType === "image/png" ? "png"
      : contentType === "image/webp" ? "webp" : null;
  if (!extension) throw new Error("Choose a JPEG, PNG, or WebP image.");
  const { error } = await supabase.storage.from(bucket).upload(`${path}.${extension}`, image, {
    cacheControl: "3600",
    contentType,
  });
  if (error) throw error;
  return `${path}.${extension}`;
}

export async function uploadProfilePicture(userId: string, asset: ImageUploadAsset): Promise<ProfileData> {
  const path = `${userId}/${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  const imagePath = await uploadImage("profile-images", path, asset);
  const { data, error } = await supabase.from("profiles").update({ avatar_path: imagePath })
    .eq("id", userId)
    .select("id, display_name, avatar_path, home_city, bio, riding_pace, discoverable")
    .single();
  if (error) throw error;
  const profile: ProfileData = {
    id: data.id,
    displayName: data.display_name,
    avatarPath: data.avatar_path,
    homeCity: data.home_city,
    bio: data.bio,
    ridingPace: data.riding_pace,
    discoverable: data.discoverable,
  };
  await writeStored(userId, profileKey, profile);
  return profile;
}

export async function uploadRideBannerImage(userId: string, rideId: string, asset: ImageUploadAsset): Promise<string> {
  const path = `${userId}/${rideId}/${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  return uploadImage("ride-banners", path, asset);
}

export async function uploadMessageMedia(userId: string, conversationId: string, asset: ImageUploadAsset): Promise<string> {
  const path = `${userId}/${conversationId}/${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  if (asset.fileSize != null && asset.fileSize > MAX_MESSAGE_ATTACHMENT_SIZE_BYTES) {
    throw new Error("Choose an attachment smaller than 20 MB.");
  }
  const response = await fetch(asset.uri);
  if (!response.ok) throw new Error("Could not read the selected attachment.");
  const file = await response.arrayBuffer();
  if (file.byteLength > MAX_MESSAGE_ATTACHMENT_SIZE_BYTES) {
    throw new Error("Choose an attachment smaller than 20 MB.");
  }
  const contentType = (asset.mimeType || response.headers.get("content-type") || "application/octet-stream")
    .split(";")[0].trim().toLowerCase();
  const extension = asset.fileName?.match(/\.([a-z0-9]{1,10})$/i)?.[1]?.toLowerCase()
    ?? ({
      "image/jpeg": "jpg",
      "image/png": "png",
      "image/webp": "webp",
      "image/heic": "heic",
      "video/mp4": "mp4",
      "video/quicktime": "mov",
      "video/webm": "webm",
      "audio/mpeg": "mp3",
      "audio/mp4": "m4a",
      "audio/wav": "wav",
      "application/pdf": "pdf",
    } as Record<string, string>)[contentType]
    ?? "bin";
  const storagePath = `${path}.${extension}`;
  const { error } = await supabase.storage.from("message-media").upload(storagePath, file, {
    cacheControl: "3600",
    contentType,
  });
  if (error) throw error;
  return storagePath;
}

export async function getMessageImageUrl(path: string): Promise<string> {
  const { data, error } = await supabase.storage.from("message-media").createSignedUrl(path, 60 * 60);
  if (error) throw error;
  return data.signedUrl;
}

// Pulls every top-level dataset into storage; screens only read from storage afterwards.
export async function syncAll(userId: string): Promise<void> {
  const conversationsPromise = loadConversations(userId, true);
  const results = await Promise.allSettled([
    loadProfile(userId, true),
    loadOpenRides(userId, true),
    loadNearbyRiders(userId, true),
    loadFriendRequests(userId, true),
    conversationsPromise,
    loadUserRideRequests(userId, true),
    loadUserRides(userId, true).then((rides) => loadRideAdmins(rides.filter((ride) => ride.creatorId === userId).map((ride) => ride.id), userId, true)),
    loadPendingAdminRequests(userId, true),
    loadNotifications(userId, true),
  ]);
  const failures = results.flatMap((result) => result.status === "rejected" ? [result.reason] : []);

  const conversationsResult = results[4];
  if (conversationsResult.status === "fulfilled") {
    const messageResults = await Promise.allSettled(
      conversationsResult.value.map((conversation) => syncMessages(conversation.id, userId)),
    );
    failures.push(...messageResults.flatMap((result) => result.status === "rejected" ? [result.reason] : []));
  }

  if (failures.length) {
    for (const failure of failures) console.error("[sync] Dataset sync failed", failure);
    throw new Error(`Catch-up sync did not finish successfully (${failures.length} dataset(s) failed).`);
  }
}
