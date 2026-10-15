import { createContext, PropsWithChildren, useContext, useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "../lib/supabase";
import { clearStore } from "../lib/local-store";

type AuthResult = { error: string | null };
type SignUpResult = AuthResult & { hasSession: boolean };

type AuthContextValue = {
  ready: boolean;
  isSignedIn: boolean;
  userId: string | null;
  userEmail: string | null;
  signIn: (email: string, password: string) => Promise<AuthResult>;
  signUp: (name: string, email: string, password: string) => Promise<SignUpResult>;
  verifySignupOtp: (email: string, otp: string) => Promise<AuthResult>;
  resendSignupOtp: (email: string) => Promise<AuthResult>;
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
    return { error: error?.message ?? null };
  }

  async function signUp(name: string, email: string, password: string): Promise<SignUpResult> {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { full_name: name } },
    });
    return { error: error?.message ?? null, hasSession: Boolean(data.session) };
  }

  async function verifySignupOtp(email: string, otp: string): Promise<AuthResult> {
    const { error } = await supabase.auth.verifyOtp({ email, token: otp, type: "email" });
    return { error: error?.message ?? null };
  }

  async function resendSignupOtp(email: string): Promise<AuthResult> {
    const { error } = await supabase.auth.resend({ type: "signup", email });
    return { error: error?.message ?? null };
  }

  async function signOut(): Promise<AuthResult> {
    const { error } = await supabase.auth.signOut();
    if (!error) await clearStore();
    return { error: error?.message ?? null };
  }

  return (
    <AuthContext.Provider value={{ ready, isSignedIn: Boolean(session), userId: session?.user.id ?? null, userEmail: session?.user.email ?? null, signIn, signUp, verifySignupOtp, resendSignupOtp, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used inside AuthProvider");
  return context;
}