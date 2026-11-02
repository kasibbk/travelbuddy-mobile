import { useEffect, useState } from "react";
import { Link, useLocalSearchParams, useRouter } from "expo-router";
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { colors } from "../components/theme";
import { supabase } from "../lib/supabase";

export default function ResetPasswordScreen() {
  const router = useRouter();
  const { token_hash: tokenHash, type } = useLocalSearchParams<{ token_hash?: string; type?: string }>();
  const [checking, setChecking] = useState(true);
  const [validLink, setValidLink] = useState(false);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    let active = true;
    async function verifyLink() {
      const token = Array.isArray(tokenHash) ? tokenHash[0] : tokenHash;
      const tokenType = Array.isArray(type) ? type[0] : type;
      if (!token || tokenType !== "recovery") {
        setError("This password reset link is invalid or incomplete. Request a new link.");
        setChecking(false);
        return;
      }
      const { error: verifyError } = await supabase.auth.verifyOtp({ token_hash: token, type: "recovery" });
      if (!active) return;
      if (verifyError) setError(verifyError.message);
      else setValidLink(true);
      setChecking(false);
    }
    void verifyLink().catch((cause: unknown) => {
      if (active) {
        setError(cause instanceof Error ? cause.message : "Could not verify this reset link.");
        setChecking(false);
      }
    });
    return () => { active = false; };
  }, [tokenHash, type]);

  async function savePassword() {
    if (password.length < 8) {
      setError("Use at least 8 characters for your password.");
      return;
    }
    if (password !== confirmPassword) {
      setError("The passwords do not match.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const { error: updateError } = await supabase.auth.updateUser({ password });
      if (updateError) throw updateError;
      const { error: signOutError } = await supabase.auth.signOut({ scope: "local" });
      if (signOutError) throw signOutError;
      setValidLink(false);
      setNotice("Your password was updated. Sign in with your new password.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not update your password.");
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    if (notice) router.replace("/login");
  }, [notice, router]);

  return <View style={styles.screen}>
    <Text style={styles.eyebrow}>ACCOUNT RECOVERY</Text>
    <Text style={styles.title}>Choose a new password</Text>
    {checking ? <ActivityIndicator color={colors.leaf} /> : validLink ? <>
      <TextInput value={password} onChangeText={setPassword} secureTextEntry autoComplete="new-password" placeholder="New password (8+ characters)" placeholderTextColor={colors.subtle} style={styles.input} />
      <TextInput value={confirmPassword} onChangeText={setConfirmPassword} secureTextEntry autoComplete="new-password" placeholder="Confirm new password" placeholderTextColor={colors.subtle} style={styles.input} />
      <Pressable accessibilityRole="button" disabled={busy} onPress={() => void savePassword()} style={[styles.button, busy && styles.disabled]}>{busy ? <ActivityIndicator color={colors.surface} /> : <Text style={styles.buttonText}>Update password</Text>}</Pressable>
    </> : <Text accessibilityRole="alert" style={error ? styles.error : styles.notice}>{error || notice}</Text>}
    {!validLink && !checking && <Link href="/forgot-password" asChild><Pressable><Text style={styles.link}>Request another reset link</Text></Pressable></Link>}
  </View>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, justifyContent: "center", gap: 13, padding: 26, backgroundColor: colors.paper },
  eyebrow: { color: colors.leaf, fontSize: 8, fontWeight: "800", letterSpacing: 1 },
  title: { color: colors.ink, fontFamily: "Georgia", fontSize: 29 },
  input: { minHeight: 44, paddingHorizontal: 11, borderWidth: 1, borderColor: colors.line, borderRadius: 8, backgroundColor: colors.surface, color: colors.ink, fontSize: 10 },
  button: { minHeight: 44, alignItems: "center", justifyContent: "center", borderRadius: 8, backgroundColor: colors.forest },
  disabled: { opacity: 0.6 },
  buttonText: { color: colors.surface, fontSize: 10, fontWeight: "800" },
  error: { color: "#A25743", fontSize: 9, lineHeight: 14 },
  notice: { color: colors.forest, fontSize: 9, lineHeight: 14 },
  link: { alignSelf: "center", color: colors.forest, fontSize: 9, fontWeight: "700" },
});
