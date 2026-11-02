import { useEffect, useState } from "react";
import { Link, useLocalSearchParams } from "expo-router";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { supabase } from "../lib/supabase";
import { colors } from "../components/theme";

export default function ActivateAccountScreen() {
  const { token_hash: tokenHash, type } = useLocalSearchParams<{ token_hash?: string; type?: string }>();
  const [status, setStatus] = useState<"checking" | "success" | "error">("checking");
  const [message, setMessage] = useState("Verifying your activation link…");

  useEffect(() => {
    let active = true;
    async function activate() {
      const token = Array.isArray(tokenHash) ? tokenHash[0] : tokenHash;
      const tokenType = Array.isArray(type) ? type[0] : type;
      if (!token || tokenType !== "signup") {
        setStatus("error");
        setMessage("This activation link is invalid or incomplete. Request a new confirmation email and try again.");
        return;
      }
      const { error } = await supabase.auth.verifyOtp({ token_hash: token, type: "signup" });
      if (error) {
        if (active) {
          setStatus("error");
          setMessage(error.message);
        }
        return;
      }
      await supabase.auth.signOut({ scope: "local" });
      if (active) {
        setStatus("success");
        setMessage("Your email is confirmed. You can now sign in to TravelBuddy.");
      }
    }
    void activate().catch((cause: unknown) => {
      if (active) {
        setStatus("error");
        setMessage(cause instanceof Error ? cause.message : "Could not activate this account.");
      }
    });
    return () => { active = false; };
  }, [tokenHash, type]);

  return <View style={styles.screen}>
    <Text style={styles.eyebrow}>TRAVELBUDDY ACCOUNT</Text>
    <Text style={styles.title}>{status === "success" ? "You’re all set." : status === "error" ? "Activation link issue" : "Activating your account"}</Text>
    {status === "checking" && <ActivityIndicator color={colors.leaf} />}
    <Text accessibilityRole="alert" style={status === "error" ? styles.error : styles.message}>{message}</Text>
    {status !== "checking" && <Link href="/login" asChild><Pressable style={styles.button}><Text style={styles.buttonText}>Continue to sign in</Text></Pressable></Link>}
  </View>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, justifyContent: "center", gap: 14, padding: 26, backgroundColor: colors.paper },
  eyebrow: { color: colors.leaf, fontSize: 8, fontWeight: "800", letterSpacing: 1 },
  title: { color: colors.ink, fontFamily: "Georgia", fontSize: 29 },
  message: { color: colors.muted, fontSize: 11, lineHeight: 17 },
  error: { color: "#A25743", fontSize: 11, lineHeight: 17 },
  button: { minHeight: 44, alignItems: "center", justifyContent: "center", borderRadius: 8, backgroundColor: colors.forest },
  buttonText: { color: colors.surface, fontSize: 10, fontWeight: "800" },
});
