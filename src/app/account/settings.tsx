import { useState } from "react";
import { ArrowLeft, LogOut, ShieldCheck, UserRoundX, UserRoundMinus } from "lucide-react-native";
import { useRouter } from "expo-router";
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useAuth } from "../../components/auth-provider";
import { colors } from "../../components/theme";
import { getAuthRedirectUrl } from "../../lib/auth-links";
import { clearStore } from "../../lib/local-store";
import { supabase } from "../../lib/supabase";

type LifecycleAction = "deactivate" | "delete";

export default function AccountSettingsScreen() {
  const router = useRouter();
  const { userId, userEmail, signOut } = useAuth();
  const [action, setAction] = useState<LifecycleAction | null>(null);
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [busy, setBusy] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [resetBusy, setResetBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  async function sendPasswordReset() {
    if (!userEmail || resetBusy) return;
    setResetBusy(true);
    setError("");
    setNotice("");
    try {
      const redirectTo = getAuthRedirectUrl("/reset-password");
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(userEmail, redirectTo ? { redirectTo } : undefined);
      if (resetError) throw resetError;
      setNotice("If this email has an account, a password reset link has been sent.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not send a password reset link.");
    } finally {
      setResetBusy(false);
    }
  }

  async function handleSignOut() {
    if (signingOut) return;
    setSigningOut(true);
    setError("");
    try {
      const result = await signOut();
      if (result.error) throw new Error(result.error);
      router.replace("/");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not sign out.");
    } finally {
      setSigningOut(false);
    }
  }

  function openAction(nextAction: LifecycleAction) {
    setAction(nextAction);
    setPassword("");
    setConfirmation("");
    setError("");
  }

  function closeAction() {
    if (busy) return;
    setAction(null);
    setPassword("");
    setConfirmation("");
    setError("");
  }

  async function confirmAction() {
    if (!userId || !userEmail || !action || busy) return;
    if (password.length < 6) {
      setError("Enter your current password to confirm this change.");
      return;
    }
    const expectedConfirmation = action === "delete" ? "DELETE" : "PAUSE";
    if (confirmation !== expectedConfirmation) {
      setError(`Type ${expectedConfirmation} to confirm.`);
      return;
    }
    setBusy(true);
    setError("");
    try {
      const { error: reauthError } = await supabase.auth.signInWithPassword({ email: userEmail, password });
      if (reauthError) throw new Error("That password is incorrect. Try again.");

      if (action === "deactivate") {
        const { error: deactivateError } = await supabase.rpc("deactivate_account");
        if (deactivateError) throw deactivateError;
      } else {
        const { data, error: deleteError } = await supabase.functions.invoke("account-lifecycle", { body: { action: "delete" } });
        if (deleteError) throw new Error(deleteError.message);
        if (data && typeof data.error === "string") throw new Error(data.error);
      }

      setAction(null);
      const { error: signOutError } = await supabase.auth.signOut({ scope: action === "deactivate" ? "global" : "local" });
      if (signOutError) {
        const { error: localSignOutError } = await supabase.auth.signOut({ scope: "local" });
        await clearStore();
        if (localSignOutError) throw new Error("The account action completed, but this device could not clear its session. Close the app and sign in again.");
      }
      await clearStore();
      router.replace("/");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : `Could not ${action} your account.`);
    } finally {
      setBusy(false);
    }
  }

  const isDelete = action === "delete";
  return <View style={styles.screen}>
    <View style={styles.topbar}><Pressable accessibilityLabel="Back to profile" onPress={() => router.back()} style={styles.back}><ArrowLeft color={colors.ink} size={19} /></Pressable><Text style={styles.topbarTitle}>Account &amp; sign-in</Text></View>
    <ScrollView contentContainerStyle={styles.content}>
      <Text style={styles.eyebrow}>YOUR ACCOUNT</Text>
      <Text style={styles.title}>Your TravelBuddy account</Text>
      <Text style={styles.subtitle}>Manage sign-in, account access, and personal data.</Text>
      <View style={styles.accountCard}>
        <View style={styles.cardHeader}><View><Text style={styles.fieldLabel}>SIGNED IN WITH</Text><Text style={styles.email}>{userEmail ?? "No email on this session"}</Text></View><ShieldCheck color={colors.leaf} size={20} /></View>
        <View style={styles.divider} />
        <View style={styles.settingRow}><View style={styles.settingCopy}><Text style={styles.settingTitle}>Password</Text><Text style={styles.settingDetail}>Send a secure password-reset link to your email.</Text></View><Pressable accessibilityRole="button" disabled={resetBusy || !userEmail} onPress={() => void sendPasswordReset()} style={styles.smallButton}>{resetBusy ? <ActivityIndicator size="small" color={colors.forest} /> : <Text style={styles.smallButtonText}>Reset</Text>}</Pressable></View>
        {!!notice && <Text accessibilityRole="alert" style={styles.notice}>{notice}</Text>}
        {!!error && !action && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
      </View>

      <Text style={styles.sectionTitle}>Account lifecycle</Text>
      <View style={styles.actionCard}>
        <View style={styles.actionHeader}><UserRoundMinus color={colors.leaf} size={17} /><Text style={styles.settingTitle}>Deactivate account</Text></View>
        <Text style={styles.settingDetail}>Pause your account, hide it from discovery, and show “Inactive user” on public references. Sign in later to reactivate.</Text>
        <Pressable accessibilityRole="button" onPress={() => openAction("deactivate")} style={styles.secondaryAction}><Text style={styles.secondaryActionText}>Deactivate account</Text></Pressable>
      </View>
      <View style={styles.actionCard}>
        <View style={styles.actionHeader}><UserRoundX color="#A25743" size={17} /><Text style={styles.settingTitle}>Delete account</Text></View>
        <Text style={styles.settingDetail}>Permanently remove your sign-in and personal profile data. Rides and chat history remain with your identity anonymized as “Inactive user”.</Text>
        <Pressable accessibilityRole="button" onPress={() => openAction("delete")} style={styles.deleteAction}><Text style={styles.deleteActionText}>Delete account</Text></Pressable>
      </View>
      <Pressable accessibilityRole="button" disabled={signingOut} onPress={() => void handleSignOut()} style={styles.signOut}>{signingOut ? <ActivityIndicator size="small" color="#9B684F" /> : <LogOut color="#9B684F" size={16} />}<Text style={styles.signOutText}>{signingOut ? "Signing out…" : "Sign out"}</Text></Pressable>
    </ScrollView>

    <Modal visible={action !== null} transparent animationType="fade" onRequestClose={closeAction}>
      <View style={styles.modalBackdrop}>
        <View style={styles.modalCard}>
          <Text style={styles.modalTitle}>{isDelete ? "Delete your account?" : "Deactivate your account?"}</Text>
          <Text style={styles.modalCopy}>{isDelete
            ? "This permanently removes your login and personal profile details. Your existing rides and conversations will remain visible as “Inactive user”. This cannot be undone."
            : "Your profile will be hidden from discovery and public references will show “Inactive user”. You can reactivate by signing in again."}</Text>
          <Text style={styles.modalLabel}>CURRENT PASSWORD</Text>
          <TextInput value={password} onChangeText={setPassword} secureTextEntry autoComplete="current-password" placeholder="Enter your password" placeholderTextColor={colors.subtle} style={styles.modalInput} />
          <Text style={styles.modalLabel}>TYPE {isDelete ? "DELETE" : "PAUSE"} TO CONFIRM</Text>
          <TextInput value={confirmation} onChangeText={setConfirmation} autoCapitalize="characters" autoCorrect={false} placeholder={isDelete ? "DELETE" : "PAUSE"} placeholderTextColor={colors.subtle} style={styles.modalInput} />
          {!!error && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
          <View style={styles.modalActions}>
            <Pressable accessibilityRole="button" disabled={busy} onPress={closeAction} style={styles.cancelButton}><Text style={styles.cancelText}>Cancel</Text></Pressable>
            <Pressable accessibilityRole="button" disabled={busy} onPress={() => void confirmAction()} style={[styles.confirmButton, isDelete && styles.confirmDelete]}>{busy ? <ActivityIndicator color={colors.surface} /> : <Text style={styles.confirmText}>{isDelete ? "Delete permanently" : "Deactivate"}</Text>}</Pressable>
          </View>
        </View>
      </View>
    </Modal>
  </View>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.paper },
  topbar: { height: 54, paddingHorizontal: 17, flexDirection: "row", alignItems: "center", gap: 11 },
  back: { width: 28, height: 38, alignItems: "flex-start", justifyContent: "center" },
  topbarTitle: { color: colors.ink, fontSize: 12, fontWeight: "700" },
  content: { flexGrow: 1, paddingHorizontal: 19, paddingTop: 24, paddingBottom: 26 },
  eyebrow: { color: colors.leaf, fontSize: 8, fontWeight: "800", letterSpacing: 0.7 },
  title: { marginTop: 7, color: colors.ink, fontFamily: "Georgia", fontSize: 27, fontWeight: "500" },
  subtitle: { maxWidth: 300, marginTop: 6, color: colors.muted, fontSize: 10, lineHeight: 15 },
  accountCard: { marginTop: 20, paddingHorizontal: 14, paddingTop: 14, paddingBottom: 10, borderWidth: 1, borderColor: colors.line, borderRadius: 12, backgroundColor: colors.surface },
  cardHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  fieldLabel: { color: colors.muted, fontSize: 7, fontWeight: "800", letterSpacing: 0.7 },
  email: { marginTop: 5, color: colors.ink, fontSize: 10, fontWeight: "700" },
  divider: { height: 1, marginTop: 13, backgroundColor: colors.line },
  settingRow: { minHeight: 62, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
  settingCopy: { flex: 1 },
  settingTitle: { color: colors.ink, fontSize: 9, fontWeight: "700" },
  settingDetail: { marginTop: 4, color: colors.muted, fontSize: 8, lineHeight: 13 },
  smallButton: { minWidth: 54, minHeight: 31, alignItems: "center", justifyContent: "center", borderRadius: 7, backgroundColor: colors.paleGreen },
  smallButtonText: { color: colors.forest, fontSize: 8, fontWeight: "800" },
  sectionTitle: { marginTop: 22, marginBottom: 9, color: colors.ink, fontSize: 11, fontWeight: "800" },
  actionCard: { marginBottom: 9, padding: 13, borderWidth: 1, borderColor: colors.line, borderRadius: 10, backgroundColor: colors.surface },
  actionHeader: { flexDirection: "row", alignItems: "center", gap: 8 },
  secondaryAction: { minHeight: 35, marginTop: 11, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: colors.line, borderRadius: 7 },
  secondaryActionText: { color: colors.forest, fontSize: 8, fontWeight: "800" },
  deleteAction: { minHeight: 35, marginTop: 11, alignItems: "center", justifyContent: "center", borderRadius: 7, backgroundColor: "#FBF0EC" },
  deleteActionText: { color: "#A25743", fontSize: 8, fontWeight: "800" },
  notice: { marginTop: 6, color: colors.forest, fontSize: 8, lineHeight: 13 },
  error: { color: "#A25743", fontSize: 8, lineHeight: 13 },
  signOut: { minHeight: 44, marginTop: 9, paddingHorizontal: 12, borderWidth: 1, borderColor: "#EADFD8", borderRadius: 9, backgroundColor: "#FBF7F4", flexDirection: "row", alignItems: "center", gap: 8 },
  signOutText: { color: "#9B684F", fontSize: 10, fontWeight: "700" },
  modalBackdrop: { flex: 1, justifyContent: "center", padding: 20, backgroundColor: "rgba(18, 29, 24, 0.48)" },
  modalCard: { gap: 10, padding: 17, borderRadius: 12, backgroundColor: colors.surface },
  modalTitle: { color: colors.ink, fontFamily: "Georgia", fontSize: 21 },
  modalCopy: { color: colors.muted, fontSize: 9, lineHeight: 14 },
  modalLabel: { marginTop: 3, color: colors.muted, fontSize: 7, fontWeight: "800", letterSpacing: 0.6 },
  modalInput: { minHeight: 39, paddingHorizontal: 10, borderWidth: 1, borderColor: colors.line, borderRadius: 7, backgroundColor: "#FDFEFB", color: colors.ink, fontSize: 10 },
  modalActions: { flexDirection: "row", justifyContent: "flex-end", gap: 8, marginTop: 4 },
  cancelButton: { minHeight: 38, minWidth: 75, alignItems: "center", justifyContent: "center", borderRadius: 7, backgroundColor: "#EEF0EA" },
  cancelText: { color: colors.ink, fontSize: 8, fontWeight: "700" },
  confirmButton: { minHeight: 38, minWidth: 100, alignItems: "center", justifyContent: "center", paddingHorizontal: 9, borderRadius: 7, backgroundColor: colors.forest },
  confirmDelete: { backgroundColor: "#A25743" },
  confirmText: { color: colors.surface, fontSize: 8, fontWeight: "800" },
});
