import { supabase } from "./supabase";

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
  capacity: number;
  status: "open" | "cancelled" | "completed";
  creator: { display_name: string } | null;
};

export type RideCardData = {
  id: string;
  creatorId: string;
  title: string;
  route: string;
  date: string;
  time: string;
  distance: string;
  duration: string;
  capacity: number;
  host: string;
  description: string;
  startsAt: string;
};

export type AdminRequestData = {
  id: string;
  rideId: string;
  rideTitle: string;
  riderName: string;
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
  city: string | null;
  distanceKm: number;
};

export type FriendData = {
  id: string;
  otherUserId: string;
  name: string;
  status: "pending" | "accepted" | "declined";
  direction: "incoming" | "outgoing";
};

export type ConversationData = {
  id: string;
  kind: "direct" | "ride";
  title: string;
  detail: string;
  lastMessage: string;
  updatedAt: string;
};

export type MessageData = {
  id: string;
  senderId: string;
  body: string;
  createdAt: string;
};

export type ProfileData = {
  id: string;
  displayName: string;
  homeCity: string | null;
  bio: string;
  ridingPace: string;
  discoverable: boolean;
};

const rideSelect = "id, creator_id, title, description, start_label, destination_label, starts_at, distance_meters, estimated_duration_minutes, capacity, status, creator:profiles!rides_creator_id_fkey(display_name)";

function mapRide(row: RideRow): RideCardData {
  const startsAt = new Date(row.starts_at);
  const distance = row.distance_meters === null
    ? "Route distance not set"
    : `${(row.distance_meters / 1609.344).toFixed(row.distance_meters < 16093 ? 1 : 0)} mi`;
  return {
    id: row.id,
    creatorId: row.creator_id,
    title: row.title,
    route: `${row.start_label} → ${row.destination_label}`,
    date: startsAt.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" }),
    time: startsAt.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" }),
    distance,
    duration: row.estimated_duration_minutes === null ? "Duration not set" : `${row.estimated_duration_minutes} min`,
    capacity: row.capacity,
    host: row.creator?.display_name ?? "Ride host",
    description: row.description,
    startsAt: row.starts_at,
  };
}

export async function loadOpenRides(): Promise<RideCardData[]> {
  const { data, error } = await supabase.from("rides")
    .select(rideSelect)
    .eq("status", "open")
    .gt("starts_at", new Date().toISOString())
    .order("starts_at", { ascending: true })
    .limit(30);
  if (error) throw error;
  return ((data ?? []) as unknown as RideRow[]).map(mapRide);
}

export async function createRide(input: {
  creatorId: string;
  title: string;
  description: string;
  startLabel: string;
  destinationLabel: string;
  startsAt: string;
  capacity: number;
}): Promise<RideCardData> {
  const { data, error } = await supabase.from("rides").insert({
    creator_id: input.creatorId,
    title: input.title,
    description: input.description,
    start_label: input.startLabel,
    destination_label: input.destinationLabel,
    starts_at: input.startsAt,
    capacity: input.capacity,
    status: "open",
  }).select(rideSelect).single();
  if (error) throw error;
  return mapRide(data as unknown as RideRow);
}

export async function loadUserRideRequests(userId: string): Promise<RideRequestData[]> {
  const { data, error } = await supabase.from("ride_requests")
    .select("id, ride_id, status")
    .eq("user_id", userId)
    .in("status", ["pending", "approved", "declined", "cancelled"])
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map((request) => ({ id: request.id, rideId: request.ride_id, status: request.status as RideRequestStatus }));
}

export async function requestRide(rideId: string, userId: string): Promise<RideRequestData> {
  const { data, error } = await supabase.from("ride_requests")
    .insert({ ride_id: rideId, user_id: userId, status: "pending" })
    .select("id, ride_id, status")
    .single();
  if (error) throw error;
  return { id: data.id, rideId: data.ride_id, status: data.status as RideRequestStatus };
}

export async function cancelRideRequest(requestId: string): Promise<void> {
  const { error } = await supabase.rpc("cancel_ride_request", { p_request_id: requestId });
  if (error) throw error;
}

export async function reviewRideRequest(requestId: string, decision: "approved" | "declined"): Promise<void> {
  const { error } = await supabase.rpc("review_ride_request", { p_request_id: requestId, p_decision: decision });
  if (error) throw error;
}

export async function loadRideAdmins(rideIds: string[]): Promise<Record<string, RideAdminData[]>> {
  if (rideIds.length === 0) return {};
  const { data, error } = await supabase.from("ride_admins").select("ride_id, user_id, role").in("ride_id", rideIds);
  if (error) throw error;
  if (!data?.length) return {};
  const userIds = [...new Set(data.map((row) => row.user_id))];
  const { data: profiles, error: profileError } = await supabase.from("profiles").select("id, display_name").in("id", userIds);
  if (profileError) throw profileError;
  const names = new Map((profiles ?? []).map((profile) => [profile.id, profile.display_name]));
  return data.reduce<Record<string, RideAdminData[]>>((result, row) => {
    const admins = result[row.ride_id] ?? [];
    admins.push({ rideId: row.ride_id, userId: row.user_id, name: names.get(row.user_id) ?? "Rider", role: row.role as "owner" | "admin" });
    result[row.ride_id] = admins;
    return result;
  }, {});
}

export async function assignRideAdmin(rideId: string, userId: string, assignedBy: string): Promise<void> {
  const { error } = await supabase.from("ride_admins").insert({ ride_id: rideId, user_id: userId, role: "admin", assigned_by: assignedBy });
  if (error) throw error;
}

export async function loadUserRides(userId: string): Promise<RideCardData[]> {
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
}

export async function loadPendingAdminRequests(userId: string): Promise<AdminRequestData[]> {
  const { data: requests, error } = await supabase.from("ride_requests")
    .select("id, ride_id, user_id, message, created_at")
    .eq("status", "pending")
    .neq("user_id", userId)
    .order("created_at", { ascending: true });
  if (error) throw error;
  if (!requests?.length) return [];

  const rideIds = [...new Set(requests.map((request) => request.ride_id))];
  const userIds = [...new Set(requests.map((request) => request.user_id))];
  const [ridesResult, profilesResult] = await Promise.all([
    supabase.from("rides").select("id, title").in("id", rideIds),
    supabase.from("profiles").select("id, display_name").in("id", userIds),
  ]);
  if (ridesResult.error) throw ridesResult.error;
  if (profilesResult.error) throw profilesResult.error;
  const rideTitles = new Map((ridesResult.data ?? []).map((ride) => [ride.id, ride.title]));
  const names = new Map((profilesResult.data ?? []).map((profile) => [profile.id, profile.display_name]));
  return requests.map((request) => ({
    id: request.id,
    rideId: request.ride_id,
    rideTitle: rideTitles.get(request.ride_id) ?? "Ride",
    riderName: names.get(request.user_id) ?? "Rider",
    message: request.message,
    createdAt: request.created_at,
  }));
}

export async function loadNearbyRiders(): Promise<NearbyRiderData[]> {
  const { data, error } = await supabase.rpc("nearby_riders", { p_radius_meters: 25000, p_limit: 25 });
  if (error) throw error;
  return ((data ?? []) as { user_id: string; display_name: string; home_city: string | null; approximate_distance_km: number }[])
    .map((rider) => ({ id: rider.user_id, name: rider.display_name, city: rider.home_city, distanceKm: rider.approximate_distance_km }));
}

export async function loadFriendRequests(userId: string): Promise<FriendData[]> {
  const { data, error } = await supabase.from("friend_requests")
    .select("id, requester_id, recipient_id, status")
    .or(`requester_id.eq.${userId},recipient_id.eq.${userId}`)
    .order("created_at", { ascending: false });
  if (error) throw error;
  if (!data?.length) return [];
  const otherIds = [...new Set(data.map((request) => request.requester_id === userId ? request.recipient_id : request.requester_id))];
  const { data: profiles, error: profileError } = await supabase.from("profiles").select("id, display_name").in("id", otherIds);
  if (profileError) throw profileError;
  const names = new Map((profiles ?? []).map((profile) => [profile.id, profile.display_name]));
  return data.map((request) => {
    const otherId = request.requester_id === userId ? request.recipient_id : request.requester_id;
    return { id: request.id, otherUserId: otherId, name: names.get(otherId) ?? "Rider", status: request.status, direction: request.requester_id === userId ? "outgoing" : "incoming" };
  });
}

export async function createFriendRequest(requesterId: string, recipientId: string): Promise<void> {
  const { error } = await supabase.from("friend_requests").insert({ requester_id: requesterId, recipient_id: recipientId, status: "pending" });
  if (error) throw error;
}

export async function respondToFriendRequest(requestId: string, accept: boolean): Promise<void> {
  const { error } = await supabase.rpc("respond_to_friend_request", { p_request_id: requestId, p_accept: accept });
  if (error) throw error;
}

export async function createDirectConversation(otherUserId: string): Promise<string> {
  const { data, error } = await supabase.rpc("create_direct_conversation", { p_other_user_id: otherUserId });
  if (error) throw error;
  return data;
}

export async function loadConversations(userId: string): Promise<ConversationData[]> {
  const { data: memberships, error } = await supabase.from("conversation_members")
    .select("conversation_id, conversation:conversations(id, kind, ride_id, direct_user_low, direct_user_high, created_at)")
    .eq("user_id", userId);
  if (error) throw error;
  const conversations = (memberships ?? []).flatMap((row) => Array.isArray(row.conversation) ? row.conversation : row.conversation ? [row.conversation] : []) as unknown as {
    id: string; kind: "direct" | "ride"; ride_id: string | null; direct_user_low: string | null;
    direct_user_high: string | null; created_at: string;
  }[];
  if (conversations.length === 0) return [];

  const rideIds = conversations.flatMap((conversation) => conversation.ride_id ? [conversation.ride_id] : []);
  const peerIds = [...new Set(conversations.flatMap((conversation) => {
    if (conversation.kind !== "direct") return [];
    const peerId = conversation.direct_user_low === userId ? conversation.direct_user_high : conversation.direct_user_low;
    return peerId ? [peerId] : [];
  }))];
  const conversationIds = conversations.map((conversation) => conversation.id);
  const [ridesResult, peersResult, messagesResult] = await Promise.all([
    rideIds.length ? supabase.from("rides").select("id, title").in("id", rideIds) : Promise.resolve({ data: [], error: null }),
    peerIds.length ? supabase.from("profiles").select("id, display_name").in("id", peerIds) : Promise.resolve({ data: [], error: null }),
    supabase.from("messages").select("conversation_id, body, created_at").in("conversation_id", conversationIds).order("created_at", { ascending: false }).limit(100),
  ]);
  if (ridesResult.error) throw ridesResult.error;
  if (peersResult.error) throw peersResult.error;
  if (messagesResult.error) throw messagesResult.error;
  const rideTitles = new Map((ridesResult.data ?? []).map((ride) => [ride.id, ride.title]));
  const peerNames = new Map((peersResult.data ?? []).map((profile) => [profile.id, profile.display_name]));
  const latestMessages = new Map<string, { body: string; created_at: string }>();
  for (const message of messagesResult.data ?? []) if (!latestMessages.has(message.conversation_id)) latestMessages.set(message.conversation_id, message);
  return conversations.map((conversation) => ({
    id: conversation.id,
    kind: conversation.kind,
    title: conversation.kind === "ride" && conversation.ride_id ? rideTitles.get(conversation.ride_id) ?? "Ride chat" : peerNames.get(conversation.direct_user_low === userId ? conversation.direct_user_high ?? "" : conversation.direct_user_low ?? "") ?? "Friend chat",
    detail: conversation.kind === "ride" ? "Ride group conversation" : "Direct conversation",
    lastMessage: latestMessages.get(conversation.id)?.body ?? "No messages yet",
    updatedAt: latestMessages.get(conversation.id)?.created_at ?? conversation.created_at,
  }));
}

export async function loadMessages(conversationId: string): Promise<MessageData[]> {
  const { data, error } = await supabase.from("messages")
    .select("id, sender_id, body, created_at")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data ?? []).map((message) => ({ id: message.id, senderId: message.sender_id, body: message.body, createdAt: message.created_at }));
}

export async function sendMessage(conversationId: string, senderId: string, body: string): Promise<MessageData> {
  const { data, error } = await supabase.from("messages")
    .insert({ conversation_id: conversationId, sender_id: senderId, body })
    .select("id, sender_id, body, created_at")
    .single();
  if (error) throw error;
  return { id: data.id, senderId: data.sender_id, body: data.body, createdAt: data.created_at };
}

export async function loadProfile(userId: string): Promise<ProfileData | null> {
  const { data, error } = await supabase.from("profiles")
    .select("id, display_name, home_city, bio, riding_pace, discoverable")
    .eq("id", userId)
    .maybeSingle();
  if (error) throw error;
  return data ? { id: data.id, displayName: data.display_name, homeCity: data.home_city, bio: data.bio, ridingPace: data.riding_pace, discoverable: data.discoverable } : null;
}

export async function updateProfile(input: Omit<ProfileData, "id"> & { id: string }): Promise<ProfileData> {
  const { data, error } = await supabase.from("profiles").update({
    display_name: input.displayName,
    home_city: input.homeCity,
    bio: input.bio,
    riding_pace: input.ridingPace,
    discoverable: input.discoverable,
  }).eq("id", input.id).select("id, display_name, home_city, bio, riding_pace, discoverable").single();
  if (error) throw error;
  return { id: data.id, displayName: data.display_name, homeCity: data.home_city, bio: data.bio, ridingPace: data.riding_pace, discoverable: data.discoverable };
}

export async function hasSavedProfileLocation(userId: string): Promise<boolean> {
  const { data, error } = await supabase.from("profile_locations").select("user_id").eq("user_id", userId).maybeSingle();
  if (error) throw error;
  return Boolean(data);
}

export async function saveProfileLocation(userId: string, latitude: number, longitude: number): Promise<void> {
  if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90 || !Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
    throw new Error("The device returned an invalid location.");
  }
  const { error } = await supabase.from("profile_locations").upsert({
    user_id: userId,
    location: `SRID=4326;POINT(${longitude} ${latitude})`,
  }, { onConflict: "user_id" });
  if (error) throw error;
}

export async function removeProfileLocation(userId: string): Promise<void> {
  const { error } = await supabase.from("profile_locations").delete().eq("user_id", userId);
  if (error) throw error;
}