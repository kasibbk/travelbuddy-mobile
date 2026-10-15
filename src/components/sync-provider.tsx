import { PropsWithChildren, useEffect } from "react";
import { AppState } from "react-native";
import { useAuth } from "./auth-provider";
import { syncAll } from "../lib/app-data";
import { pruneStoreExcept, readStored, storeAvailable, writeStored } from "../lib/local-store";

const RESUME_SYNC_AFTER_MS = 5 * 60_000;

export function SyncProvider({ children }: PropsWithChildren) {
  const { ready, userId } = useAuth();

  useEffect(() => {
    if (!storeAvailable || !ready || !userId) return;
    let running = false;
    async function sync(onlyIfStale: boolean) {
      if (running) return;
      running = true;
      try {
        const last = await readStored<number>(userId as string, "last-sync");
        if (onlyIfStale && last !== undefined && Date.now() - last < RESUME_SYNC_AFTER_MS) return;
        await syncAll(userId as string);
        await writeStored(userId as string, "last-sync", Date.now());
      } finally {
        running = false;
      }
    }
    void pruneStoreExcept(userId).then(() => sync(true));
    const subscription = AppState.addEventListener("change", (state) => { if (state === "active") void sync(true); });
    return () => subscription.remove();
  }, [ready, userId]);

  return <>{children}</>;
}
