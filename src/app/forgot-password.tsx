import { useState } from "react";
import { Link } from "expo-router";
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { colors } from "../components/theme";
import { getAuthRedirectUrl } from "../lib/auth-links";
import { supabase } from "../lib/supabase";

export default function ForgotPasswordScreen() {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  async function sendResetLink() {
    if (!email.includes("@")) {
      setError("Enter the email address for your account.");
      return;
    }
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const redirectTo = getAuthRedirectUrl("/reset-password");
      const { error: requestError } = await supabase.auth.resetPasswordForEmail(email.trim(), redirectTo ? { redirectTo } : undefined);
      if (requestError) throw requestError;
      setNotice("If an account exists for that email, a password reset link has been sent.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not request a password reset.");
    } finally {
      setBusy(false);
    }
  }

  return <View style={styles.screen}>
    <Text style={styles.eyebrow}>ACCOUNT RECOVERY</Text>
    <Text style={styles.title}>Reset your password</Text>
    <Text style={styles.copy}>Enter the email address on your account and we’ll send a secure reset link.</Text>
    <TextInput value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" autoComplete="email" placeholder="you@example.com" placeholderTextColor={colors.subtle} style={styles.input} />
    {!!error && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
    {!!notice && <Text accessibilityRole="alert" style={styles.notice}>{notice}</Text>}
    <Pressable accessibilityRole="button" disabled={busy} onPress={() => void sendResetLink()} style={[styles.button, busy && styles.disabled]}>{busy ? <ActivityIndicator color={colors.surface} /> : <Text style={styles.buttonText}>Send reset link</Text>}</Pressable>
    <Link href="/login" asChild><Pressable><Text style={styles.link}>Back to sign in</Text></Pressable></Link>
  </View>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, justifyContent: "center", gap: 13, padding: 26, backgroundColor: colors.paper },
  eyebrow: { color: colors.leaf, fontSize: 8, fontWeight: "800", letterSpacing: 1 },
  title: { color: colors.ink, fontFamily: "Georgia", fontSize: 29 },
  copy: { color: colors.muted, fontSize: 10, lineHeight: 16 },
  input: { minHeight: 44, paddingHorizontal: 11, borderWidth: 1, borderColor: colors.line, borderRadius: 8, backgroundColor: colors.surface, color: colors.ink, fontSize: 10 },
  button: { minHeight: 44, alignItems: "center", justifyContent: "center", borderRadius: 8, backgroundColor: colors.forest },
  disabled: { opacity: 0.6 },
  buttonText: { color: colors.surface, fontSize: 10, fontWeight: "800" },
  error: { color: "#A25743", fontSize: 9 },
  notice: { color: colors.forest, fontSize: 9, lineHeight: 14 },
  link: { alignSelf: "center", color: colors.forest, fontSize: 9, fontWeight: "700" },
});
