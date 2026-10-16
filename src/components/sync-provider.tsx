import { createContext, PropsWithChildren, useContext, useEffect, useState } from "react";
import { AppState } from "react-native";
import { useAuth } from "./auth-provider";
import { loadConversations, loadFriendRequests, loadOpenRides, loadPendingAdminRequests, loadRideDetails, loadUserRideRequests, loadUserRides, syncAll, syncMessages } from "../lib/app-data";
import { loadNotifications } from "../lib/notifications";
import { supabase } from "../lib/supabase";
import { pruneStoreExcept, readStored, storeAvailable, writeStored } from "../lib/local-store";
import { emitStoreChange } from "../lib/store-events";

const RESUME_SYNC_AFTER_MS = 5 * 60_000;

const InitialSyncContext = createContext(false);

export function useInitialSyncReady() {
  return useContext(InitialSyncContext);
}

export function SyncProvider({ children }: PropsWithChildren) {
  const { ready, userId } = useAuth();
  const [completedUserId, setCompletedUserId] = useState<string | null>(null);
  const initialSyncReady = ready && (!userId || completedUserId === userId);

  useEffect(() => {
    if (!ready) return;
    if (!userId) {
      setCompletedUserId(null);
      return;
    }
    const activeUserId = userId;
    let running = false;
    async function sync(onlyIfStale: boolean) {
      if (!storeAvailable) return;
      if (running) return;
      running = true;
      try {
        const last = await readStored<number>(activeUserId, "last-sync");
        if (onlyIfStale && last !== undefined && Date.now() - last < RESUME_SYNC_AFTER_MS) return;
        await syncAll(activeUserId);
        await writeStored(activeUserId, "last-sync", Date.now());
      } finally {
        running = false;
      }
    }

    let active = true;
    async function runInitialSync() {
      try {
        if (storeAvailable) {
          await pruneStoreExcept(activeUserId);
          await sync(false);
        }
      } catch (error) {
        console.error("[sync] Startup catch-up sync failed", error);
      } finally {
        if (active) setCompletedUserId(activeUserId);
      }
    }
    void runInitialSync();
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") {
        void sync(true).catch((error: unknown) => console.warn("[sync] Resume sync failed", error));
      }
    });
    const pendingChanges = new Set<string>();
    const messageConversations = new Set<string>();
    const rideDetails = new Set<string>();
    let refreshTimer: ReturnType<typeof setTimeout> | null = null;
    let refreshing = false;
    let refreshAgain = false;

    function enqueueRefresh(key: string, conversationId?: string) {
      pendingChanges.add(key);
      if (conversationId) messageConversations.add(conversationId);
      if (refreshTimer) clearTimeout(refreshTimer);
      refreshTimer = setTimeout(() => { void flushChanges(); }, 150);
    }

    async function flushChanges() {
      refreshTimer = null;
      if (refreshing) {
        refreshAgain = true;
        return;
      }
      refreshing = true;
      const changed = new Set(pendingChanges);
      const conversations = [...messageConversations];
      const rides = [...rideDetails];
      pendingChanges.clear();
      messageConversations.clear();
      rideDetails.clear();
      if (!storeAvailable) {
        emitStoreChange();
        refreshing = false;
        if ((pendingChanges.size || refreshAgain) && !refreshTimer) {
          refreshAgain = false;
          refreshTimer = setTimeout(() => { void flushChanges(); }, 150);
        }
        return;
      }

      const tasks: Promise<unknown>[] = [];
      if (changed.has("rides")) tasks.push(loadOpenRides(activeUserId, true), loadUserRides(activeUserId, true));
      tasks.push(...rides.map((id) => loadRideDetails(id, activeUserId, true)));
      if (changed.has("friends")) tasks.push(loadFriendRequests(activeUserId, true));
      if (changed.has("ride-requests") || changed.has("ride-admins")) {
        tasks.push(loadUserRideRequests(activeUserId, true), loadUserRides(activeUserId, true), loadPendingAdminRequests(activeUserId, true), loadConversations(activeUserId, true));
      }
      if (changed.has("messages")) {
        tasks.push(loadConversations(activeUserId, true));
        tasks.push(...conversations.map((id) => syncMessages(id, activeUserId)));
      }
      if (changed.has("conversation-members")) tasks.push(loadConversations(activeUserId, true));
      if (changed.has("conversation-reads")) tasks.push(loadConversations(activeUserId, true));
      if (changed.has("notifications")) tasks.push(loadNotifications(activeUserId, true));

      const results = await Promise.allSettled(tasks);
      if (__DEV__) for (const result of results) if (result.status === "rejected") console.warn("[realtime] Dataset refresh failed", result.reason);
      refreshing = false;
      if ((pendingChanges.size || refreshAgain) && !refreshTimer) {
        refreshAgain = false;
        refreshTimer = setTimeout(() => { void flushChanges(); }, 150);
      }
    }

    const channel = supabase.channel(`account-sync:${activeUserId}`);
    channel.on("postgres_changes", { event: "*", schema: "public", table: "rides" }, (payload) => {
      const row = payload.new as { id?: string };
      const oldRow = payload.old as { id?: string };
      const rideId = row.id ?? oldRow.id;
      if (rideId) rideDetails.add(rideId);
      enqueueRefresh("rides");
    });
    channel.on("postgres_changes", { event: "*", schema: "public", table: "ride_requests" }, () => enqueueRefresh("ride-requests"));
    channel.on("postgres_changes", { event: "*", schema: "public", table: "ride_admins", filter: `user_id=eq.${activeUserId}` }, () => enqueueRefresh("ride-admins"));
    channel.on("postgres_changes", { event: "*", schema: "public", table: "friend_requests" }, () => enqueueRefresh("friends"));
    channel.on("postgres_changes", { event: "INSERT", schema: "public", table: "messages" }, (payload) => {
      const row = payload.new as { conversation_id?: string };
      if (row.conversation_id) enqueueRefresh("messages", row.conversation_id);
    });
    channel.on("postgres_changes", { event: "*", schema: "public", table: "conversation_members", filter: `user_id=eq.${activeUserId}` }, () => enqueueRefresh("conversation-members"));
    channel.on("postgres_changes", { event: "*", schema: "public", table: "conversation_reads", filter: `user_id=eq.${activeUserId}` }, () => enqueueRefresh("conversation-reads"));
    channel.on("postgres_changes", { event: "*", schema: "public", table: "notifications", filter: `user_id=eq.${activeUserId}` }, () => enqueueRefresh("notifications"));
    channel.subscribe((status, error) => {
      if (__DEV__ && (status === "CHANNEL_ERROR" || status === "TIMED_OUT")) console.warn("[realtime] Subscription unavailable", error);
    });

    return () => {
      active = false;
      subscription.remove();
      if (refreshTimer) clearTimeout(refreshTimer);
      void supabase.removeChannel(channel);
    };
  }, [ready, userId]);

  return <InitialSyncContext.Provider value={initialSyncReady}>{children}</InitialSyncContext.Provider>;
}
