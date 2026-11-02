import { createContext, PropsWithChildren, useContext, useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "../lib/supabase";
import { getAuthRedirectUrl } from "../lib/auth-links";
import { clearStore } from "../lib/local-store";
import { unregisterPushTokens } from "../lib/notifications";

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

  useEffect(() => {
    let mounted = true;
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      if (mounted) {
        setSession(nextSession);
        setReady(true);
      }
    });

    supabase.auth.getSession().then(({ data }) => {
      if (mounted) {
        setSession(data.session);
        setReady(true);
      }
    }).catch(() => {
      if (mounted) setReady(true);
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  async function signIn(email: string, password: string): Promise<AuthResult> {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) return { error: error.message };
    const { data: reactivated, error: reactivationError } = await supabase.rpc("reactivate_account");
    if (reactivationError) {
      await supabase.auth.signOut({ scope: "local" });
      await clearStore();
      return { error: `Could not verify account status: ${reactivationError.message}` };
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