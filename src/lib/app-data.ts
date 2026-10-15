import { supabase } from "./supabase";
import { localFirst } from "./local-first";
import { readStored, updateStored, writeStored } from "./local-store";

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
  status: "open" | "cancelled" | "completed";
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
  rideId: string | null;
  otherUserId: string | null;
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

export type PublicProfileData = Omit<ProfileData, "discoverable"> & { avatarPath: string | null };

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
    status: row.status,
  };
}

export async function loadOpenRides(userId: string, force = false): Promise<RideCardData[]> {
  return localFirst(userId, "open-rides", async () => {
    const { data, error } = await supabase.from("rides")
      .select(rideSelect)
      .eq("status", "open")
      .gt("starts_at", new Date().toISOString())
      .order("starts_at", { ascending: true })
      .limit(30);
    if (error) throw error;
    return ((data ?? []) as unknown as RideRow[]).map(mapRide);
  }, { force });
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
  const ride = mapRide(data as unknown as RideRow);
  await Promise.all([
    updateStored<RideCardData[]>(input.creatorId, "open-rides", (rides) => [...rides, ride].sort((a, b) => a.startsAt.localeCompare(b.startsAt))),
    updateStored<RideCardData[]>(input.creatorId, "user-rides", (rides) => [...rides, ride].sort((a, b) => a.startsAt.localeCompare(b.startsAt))),
    writeStored(input.creatorId, `ride-details:${ride.id}`, ride),
  ]);
  return ride;
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
  await updateStored<AdminRequestData[]>(adminId, "pending-admin-requests", (requests) => requests.filter((request) => request.id !== requestId));
  if (reviewed?.ride_id) {
    const rideId = reviewed.ride_id;
    await updateStored<AdminRequestData[]>(adminId, `ride-requests:${rideId}`, (requests) => requests.filter((request) => request.id !== requestId));
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
  return localFirst(userId, "user-rides", async () => {
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
}

export async function loadPendingAdminRequests(userId: string, force = false): Promise<AdminRequestData[]> {
  return localFirst(userId, "pending-admin-requests", async () => {
    const { data: adminRows, error } = await supabase.from("ride_admins").select("ride_id").eq("user_id", userId);
    if (error) throw error;
    const rideIds = [...new Set((adminRows ?? []).map((row) => row.ride_id))];
    const rideRequests = await Promise.all(rideIds.map((rideId) => loadRideRequests(rideId, userId, force)));
    return rideRequests.flat().sort((left, right) => left.createdAt.localeCompare(right.createdAt));
  }, { force });
}

export async function loadNearbyRiders(userId: string, force = false): Promise<NearbyRiderData[]> {
  return localFirst(userId, "nearby-riders", async () => {
    const { data, error } = await supabase.rpc("nearby_riders", { p_radius_meters: 25000, p_limit: 25 });
    if (error) throw error;
    return ((data ?? []) as { user_id: string; display_name: string; home_city: string | null; approximate_distance_km: number }[])
      .map((rider) => ({ id: rider.user_id, name: rider.display_name, city: rider.home_city, distanceKm: rider.approximate_distance_km }));
  }, { force });
}

export async function loadFriendRequests(userId: string, force = false): Promise<FriendData[]> {
  return localFirst(userId, "friend-requests", async () => {
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
  await updateStored<FriendData[]>(userId, "friend-requests", (friends) => friends.map((friend) => friend.id === requestId ? { ...friend, status: accept ? "accepted" : "declined" } : friend));
}

export async function createDirectConversation(otherUserId: string, currentUserId: string): Promise<string> {
  const { data, error } = await supabase.rpc("create_direct_conversation", { p_other_user_id: otherUserId });
  if (error) throw error;
  await refreshStored(loadConversations(currentUserId, true));
  return data;
}

export async function loadConversations(userId: string, force = false): Promise<ConversationData[]> {
  return localFirst(userId, "conversations", async () => {
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
    rideId: conversation.ride_id,
    otherUserId: conversation.kind === "direct" ? (conversation.direct_user_low === userId ? conversation.direct_user_high : conversation.direct_user_low) : null,
    title: conversation.kind === "ride" && conversation.ride_id ? rideTitles.get(conversation.ride_id) ?? "Ride chat" : peerNames.get(conversation.direct_user_low === userId ? conversation.direct_user_high ?? "" : conversation.direct_user_low ?? "") ?? "Friend chat",
    detail: conversation.kind === "ride" ? "Ride group conversation" : "Direct conversation",
    lastMessage: latestMessages.get(conversation.id)?.body ?? "No messages yet",
    updatedAt: latestMessages.get(conversation.id)?.created_at ?? conversation.created_at,
  }));
  }, { force });
}

 
export async function loadRideDetails(rideId: string, userId: string, force = false): Promise<RideCardData | null> {
  return localFirst(userId, `ride-details:${rideId}`, async () => {
    const { data, error } = await supabase.from("rides").select(rideSelect).eq("id", rideId).maybeSingle();
    if (error) throw error;
    return data ? mapRide(data as unknown as RideRow) : null;
  }, { force });
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
  return localFirst(userId, `ride-requests:${rideId}`, async () => {
    const [{ data: requests, error }, { data: ride, error: rideError }] = await Promise.all([
      supabase.rpc("ride_requests_for_ride", { p_ride_id: rideId }),
      supabase.from("rides").select("title").eq("id", rideId).maybeSingle(),
    ]);
    if (error) throw error;
    if (rideError) throw rideError;
    return ((requests ?? []) as { id: string; ride_id: string; user_id: string; rider_name: string; message: string; created_at: string }[]).map((request) => ({
      id: request.id,
      rideId: request.ride_id,
      rideTitle: ride?.title ?? "Ride",
      riderName: request.rider_name ?? "Rider",
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
    updateStored<RideCardData[]>(userId, "open-rides", (rides) => rides.filter((ride) => ride.id !== rideId)),
    updateStored<RideCardData[]>(userId, "user-rides", markCancelled),
    updateStored<RideCardData | null>(userId, `ride-details:${rideId}`, (ride) => ride && { ...ride, status: "cancelled" }),
    writeStored(userId, `ride-requests:${rideId}`, [] as AdminRequestData[]),
  ]);
  await updateStored<AdminRequestData[]>(userId, "pending-admin-requests", (requests) => requests.filter((request) => request.rideId !== rideId));
}

export async function leaveRide(rideId: string, userId: string): Promise<void> {
  const { error } = await supabase.rpc("leave_ride", { p_ride_id: rideId });
  if (error) throw error;
  await Promise.all([
    updateStored<RideCardData[]>(userId, "user-rides", (rides) => rides.filter((ride) => ride.id !== rideId)),
    updateStored<RideRequestData[]>(userId, "user-ride-requests", (requests) => requests.map((request) => request.rideId === rideId && request.status === "approved" ? { ...request, status: "cancelled" } : request)),
    updateStored<RideParticipantData[]>(userId, `ride-participants:${rideId}`, (people) => people.filter((person) => person.userId !== userId)),
    updateStored<ConversationData[]>(userId, "conversations", (rows) => rows.filter((row) => row.rideId !== rideId)),
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
  return localFirst(userId, `shared-rides:${otherUserId}`, async () => {
    const { data, error } = await supabase.rpc("shared_active_rides", { p_other_user_id: otherUserId });
    if (error) throw error;
    return ((data ?? []) as { id: string; title: string; start_label: string; destination_label: string; starts_at: string }[])
      .map((ride) => ({ id: ride.id, title: ride.title, route: `${ride.start_label} → ${ride.destination_label}`, startsAt: ride.starts_at }));
  }, { force });
}

export async function loadMessages(conversationId: string, userId: string, force = false): Promise<MessageData[]> {
  return localFirst(userId, `messages:${conversationId}`, async () => {
    const { data, error } = await supabase.from("messages")
      .select("id, sender_id, body, created_at")
      .eq("conversation_id", conversationId)
      .order("created_at", { ascending: true });
    if (error) throw error;
    return (data ?? []).map((message) => ({ id: message.id, senderId: message.sender_id, body: message.body, createdAt: message.created_at }));
  }, { force });
}

// Fetches only messages newer than what is stored and appends them.
export async function syncMessages(conversationId: string, userId: string): Promise<void> {
  const stored = await readStored<MessageData[]>(userId, `messages:${conversationId}`);
  if (!stored) { await loadMessages(conversationId, userId, true); return; }
  const last = stored[stored.length - 1]?.createdAt;
  let query = supabase.from("messages").select("id, sender_id, body, created_at").eq("conversation_id", conversationId).order("created_at", { ascending: true });
  if (last) query = query.gt("created_at", last);
  const { data, error } = await query;
  if (error) throw error;
  if (!data?.length) return;
  const known = new Set(stored.map((message) => message.id));
  const fresh = data.filter((message) => !known.has(message.id)).map((message) => ({ id: message.id, senderId: message.sender_id, body: message.body, createdAt: message.created_at }));
  if (fresh.length) await writeStored(userId, `messages:${conversationId}`, [...stored, ...fresh]);
}

export async function sendMessage(conversationId: string, senderId: string, body: string): Promise<MessageData> {
  const { data, error } = await supabase.from("messages")
    .insert({ conversation_id: conversationId, sender_id: senderId, body })
    .select("id, sender_id, body, created_at")
    .single();
  if (error) throw error;
  const message: MessageData = { id: data.id, senderId: data.sender_id, body: data.body, createdAt: data.created_at };
  await updateStored<MessageData[]>(senderId, `messages:${conversationId}`, (thread) => thread.some((item) => item.id === message.id) ? thread : [...thread, message]);
  await updateStored<ConversationData[]>(senderId, "conversations", (rows) => rows.map((row) => row.id === conversationId ? { ...row, lastMessage: message.body, updatedAt: message.createdAt } : row));
  return message;
}

export async function loadProfile(userId: string, force = false): Promise<ProfileData | null> {
  return localFirst(userId, "profile", async () => {
    const { data, error } = await supabase.from("profiles")
      .select("id, display_name, home_city, bio, riding_pace, discoverable")
      .eq("id", userId)
      .maybeSingle();
    if (error) throw error;
    return data ? { id: data.id, displayName: data.display_name, homeCity: data.home_city, bio: data.bio, ridingPace: data.riding_pace, discoverable: data.discoverable } : null;
  }, { force });
}

export async function loadPublicProfile(targetUserId: string, viewerId: string, force = false): Promise<PublicProfileData | null> {
  return localFirst(viewerId, `public-profile:${targetUserId}`, async () => {
    const { data, error } = await supabase.rpc("public_profile", { p_user_id: targetUserId });
    if (error) throw error;
    const profile = ((data ?? []) as { id: string; display_name: string; avatar_path: string | null; home_city: string | null; bio: string; riding_pace: string }[])[0];
    return profile ? { id: profile.id, displayName: profile.display_name, avatarPath: profile.avatar_path, homeCity: profile.home_city, bio: profile.bio, ridingPace: profile.riding_pace } : null;
  }, { force });
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
  const profile: ProfileData = { id: data.id, displayName: data.display_name, homeCity: data.home_city, bio: data.bio, ridingPace: data.riding_pace, discoverable: data.discoverable };
  await writeStored(input.id, "profile", profile);
  return profile;
}

export async function hasSavedProfileLocation(userId: string, force = false): Promise<boolean> {
  return localFirst(userId, "has-location", async () => {
    const { data, error } = await supabase.from("profile_locations").select("user_id").eq("user_id", userId).maybeSingle();
    if (error) throw error;
    return Boolean(data);
  }, { force });
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
  await writeStored(userId, "has-location", true);
  await refreshStored(loadNearbyRiders(userId, true));
}

export async function removeProfileLocation(userId: string): Promise<void> {
  const { error } = await supabase.from("profile_locations").delete().eq("user_id", userId);
  if (error) throw error;
  await writeStored(userId, "has-location", false);
  await refreshStored(loadNearbyRiders(userId, true));
}

// Pulls every top-level dataset into storage; screens only read from storage afterwards.
export async function syncAll(userId: string): Promise<void> {
  await loadProfile(userId, true).catch(() => null);
  const results = await Promise.allSettled([
    hasSavedProfileLocation(userId, true),
    loadOpenRides(userId, true),
    loadNearbyRiders(userId, true),
    loadFriendRequests(userId, true),
    loadConversations(userId, true),
    loadUserRideRequests(userId, true),
    loadUserRides(userId, true).then((rides) => loadRideAdmins(rides.filter((ride) => ride.creatorId === userId).map((ride) => ride.id), userId, true)),
    loadPendingAdminRequests(userId, true),
  ]);
  if (__DEV__) for (const result of results) if (result.status === "rejected") console.warn("[sync] dataset failed", result.reason);
}
