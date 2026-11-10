import { createContext, PropsWithChildren, useContext, useEffect, useRef, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { AppState } from "react-native";
import { supabase } from "../lib/supabase";
import { getAuthRedirectUrl } from "../lib/auth-links";
import { clearStore } from "../lib/local-store";
import { unregisterPushTokens } from "../lib/notifications";
import { resumeLiveLocationTracking, stopLiveLocationTracking, stopLocalLiveLocationTask } from "../services/location/live-tracking";

type AuthResult = { error: string | null; reactivated?: boolean };
type SignUpResult = AuthResult & { hasSession: boolean };

type AuthContextValue = {
  ready: boolean;
  isSignedIn: boolean;
  userId: string | null;
  userEmail: string | null;
  signIn: (email: string, password: string) => Promise<AuthResult>;
  signUp: (name: string, email: string, password: string) => Promise<SignUpResult>;
  signOut: () => Promise<AuthResult>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: PropsWithChildren) {
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(false);
  const previousUserId = useRef<string | null>(null);

  useEffect(() => {
    let mounted = true;
    let resumedUserId: string | null = null;
    function resumeLocationForUser(userId: string, force = false) {
      if (!force && resumedUserId === userId) return;
      resumedUserId = userId;
      void resumeLiveLocationTracking(userId)
        .catch((error: unknown) => console.warn("[location] Could not resume background tracking", error));
    }

    const appStateSubscription = AppState.addEventListener("change", (state) => {
      if (state !== "active") return;
      void supabase.auth.getSession()
        .then(({ data, error }) => {
          if (error) throw error;
          if (mounted && data.session?.user.id) resumeLocationForUser(data.session.user.id, true);
        })
        .catch((error: unknown) => console.warn("[location] Could not reconcile tracking after app resume", error));
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, nextSession) => {
      if (mounted) {
        setSession(nextSession);
        setReady(true);
      }
      if (nextSession?.user.id) {
        previousUserId.current = nextSession.user.id;
        if (event === "INITIAL_SESSION" || event === "SIGNED_IN") resumeLocationForUser(nextSession.user.id);
      } else if (event === "SIGNED_OUT") {
        previousUserId.current = null;
        resumedUserId = null;
        void stopLocalLiveLocationTask()
          .catch((error: unknown) => console.warn("[location] Could not stop background tracking after sign-out", error));
      }
    });

    supabase.auth.getSession().then(({ data }) => {
      if (mounted) {
        setSession(data.session);
        previousUserId.current = data.session?.user.id ?? null;
        if (data.session?.user.id) resumeLocationForUser(data.session.user.id);
        setReady(true);
      }
    }).catch(() => {
      if (mounted) setReady(true);
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
      appStateSubscription.remove();
    };
  }, []);

  async function signIn(email: string, password: string): Promise<AuthResult> {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) return { error: error.message };
    const { data: reactivated, error: reactivationError } = await supabase.rpc("reactivate_account");
    if (reactivationError) {
      await supabase.auth.signOut({ scope: "local" });
      await clearStore();
      return { error: `Could not verify account status: ${reactivationError.message}` };
    }
    if (data.session?.user.id) {
      try {
        await resumeLiveLocationTracking(data.session.user.id);
      } catch (locationError) {
        console.warn("[location] Could not resume tracking after sign-in", locationError);
      }
    }
    return { error: null, reactivated: Boolean(reactivated) };
  }

  async function signUp(name: string, email: string, password: string): Promise<SignUpResult> {
    const emailRedirectTo = getAuthRedirectUrl("/activate");
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { full_name: name },
        ...(emailRedirectTo ? { emailRedirectTo } : {}),
      },
    });
    return { error: error?.message ?? null, hasSession: Boolean(data.session) };
  }

  async function signOut(): Promise<AuthResult> {
    if (session?.user.id) {
      try {
        await stopLiveLocationTracking(session.user.id);
      } catch (error) {
        console.warn("[location] Could not clear live location before sign-out", error);
      }
      try {
        await unregisterPushTokens(session.user.id);
      } catch (error) {
        console.warn("[push] Could not unregister this device before sign-out", error);
      }
    }
    const { error } = await supabase.auth.signOut();
    if (!error) await clearStore();
    return { error: error?.message ?? null };
  }

  return (
    <AuthContext.Provider value={{ ready, isSignedIn: Boolean(session), userId: session?.user.id ?? null, userEmail: session?.user.email ?? null, signIn, signUp, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used inside AuthProvider");
  return context;
}