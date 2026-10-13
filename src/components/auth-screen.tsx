import { useState } from "react";
import { ArrowLeft, Bike, Eye, EyeOff } from "lucide-react-native";
import { Link } from "expo-router";
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from "react-native";
import { useAuth } from "./auth-provider";
import { colors } from "./theme";

type AuthScreenProps = { mode: "login" | "register" };

export function AuthScreen({ mode }: AuthScreenProps) {
  const { signIn, signUp, verifySignupOtp, resendSignupOtp } = useAuth();
  const isRegister = mode === "register";
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [accepted, setAccepted] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [awaitingOtp, setAwaitingOtp] = useState(false);
  const [otp, setOtp] = useState("");

  async function submit() {
    setError("");
    setNotice("");
    if (isRegister && awaitingOtp && !/^\d{6,8}$/.test(otp.trim())) return setError("Enter the 6–8 digit code from your email.");
    if (isRegister && !awaitingOtp && name.trim().length < 2) return setError("Add your name to get started.");
    if (!email.includes("@")) return setError("Enter a valid email address.");
    if (!isRegister || !awaitingOtp) {
      if (password.length < (isRegister ? 8 : 6)) return setError(isRegister ? "Use at least 8 characters for your password." : "Enter your password to continue.");
      if (isRegister && !accepted) return setError("Please accept the community guidelines to continue.");
    }
    setSubmitting(true);
    try {
      if (isRegister) {
        if (awaitingOtp) {
          const result = await verifySignupOtp(email.trim(), otp.trim());
          if (result.error) setError(result.error);
          return;
        }

        const result = await signUp(name.trim(), email.trim(), password);
        if (result.error) setError(result.error);
        else if (!result.hasSession) {
          setAwaitingOtp(true);
          setNotice(`We sent a confirmation code to ${email.trim()}.`);
        }
      } else {
        const result = await signIn(email.trim(), password);
        if (result.error) setError(result.error);
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not reach Supabase. Check your connection and try again.");
    } finally {
      setSubmitting(false);
    }
  }

  async function resendCode() {
    setError("");
    setNotice("");
    setSubmitting(true);
    try {
      const result = await resendSignupOtp(email.trim());
      if (result.error) setError(result.error);
      else setNotice(`A new confirmation code was sent to ${email.trim()}.`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not resend the code. Try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        <View style={styles.topRow}><Link href="/" asChild><Pressable accessibilityLabel="Back to welcome" style={styles.back}><ArrowLeft color={colors.ink} size={19} /></Pressable></Link><View style={styles.brand}><View style={styles.brandMark}><Bike color={colors.lime} size={16} /></View><Text style={styles.brandName}>travelbuddy</Text></View></View>
        <View style={styles.heading}><Text style={styles.eyebrow}>{isRegister && awaitingOtp ? "ONE QUICK CHECK" : isRegister ? "YOUR NEXT CHAPTER STARTS HERE" : "GOOD TO HAVE YOU BACK"}</Text><Text style={styles.title}>{isRegister && awaitingOtp ? "Check your inbox." : isRegister ? "Come on in." : "Welcome back."}</Text><Text style={styles.subtitle}>{isRegister && awaitingOtp ? `Enter the confirmation code we sent to ${email}.` : isRegister ? "Meet your next crew and make room for a new route." : "Your next ride is already taking shape."}</Text></View>
        <View style={styles.form}>
          {isRegister && awaitingOtp ? <><Field label="EMAIL CODE" value={otp} onChangeText={(value) => setOtp(value.replace(/\D/g, "").slice(0, 8))} placeholder="00000000" keyboardType="number-pad" maxLength={8} autoComplete="one-time-code" textContentType="oneTimeCode" /><Pressable disabled={submitting} onPress={resendCode} style={styles.resend}><Text style={styles.resendText}>{submitting ? "Sending…" : "Resend code"}</Text></Pressable><Pressable onPress={() => { setAwaitingOtp(false); setOtp(""); setNotice(""); setError(""); }}><Text style={styles.changeEmail}>Use a different email</Text></Pressable></> : <>
            {isRegister && <Field label="YOUR NAME" value={name} onChangeText={setName} placeholder="Jamie Davis" autoComplete="name" />}
            <Field label="EMAIL ADDRESS" value={email} onChangeText={setEmail} placeholder="you@example.com" autoCapitalize="none" keyboardType="email-address" autoComplete="email" />
            <View><Field label="PASSWORD" value={password} onChangeText={setPassword} placeholder={isRegister ? "At least 8 characters" : "Your password"} secureTextEntry={!passwordVisible} autoComplete={isRegister ? "new-password" : "current-password"} /><Pressable accessibilityLabel={passwordVisible ? "Hide password" : "Show password"} onPress={() => setPasswordVisible(!passwordVisible)} style={styles.eye}>{passwordVisible ? <EyeOff color={colors.muted} size={17} /> : <Eye color={colors.muted} size={17} />}</Pressable></View>
            {isRegister && <View style={styles.consent}><Switch value={accepted} onValueChange={setAccepted} trackColor={{ false: "#D6DDD3", true: colors.leaf }} thumbColor={colors.surface} /><Text style={styles.consentText}>I agree to the community guidelines and privacy policy.</Text></View>}
          </>}
          {!!error && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
          {!!notice && <Text accessibilityRole="alert" style={styles.notice}>{notice}</Text>}
          <Pressable accessibilityRole="button" disabled={submitting} onPress={submit} style={[styles.submit, submitting && styles.submitDisabled]}><Text style={styles.submitText}>{submitting ? "Connecting…" : isRegister && awaitingOtp ? "Verify email" : isRegister ? "Create my account" : "Sign in"}</Text></Pressable>
          <Text style={styles.demoNote}>Authentication powered by Supabase</Text>
        </View>
        {!(isRegister && awaitingOtp) && <View style={styles.switchRow}><Text style={styles.switchText}>{isRegister ? "Already riding with us?" : "New to TravelBuddy?"}</Text><Link href={isRegister ? "/login" : "/register"} asChild><Pressable><Text style={styles.switchLink}>{isRegister ? "Sign in" : "Create an account"}</Text></Pressable></Link></View>}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function Field({ label, ...inputProps }: React.ComponentProps<typeof TextInput> & { label: string }) {
  return <View style={styles.field}><Text style={styles.label}>{label}</Text><TextInput {...inputProps} style={styles.input} placeholderTextColor={colors.subtle} /></View>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.paper },
  content: { flexGrow: 1, paddingHorizontal: 22, paddingTop: 14, paddingBottom: 22 },
  topRow: { minHeight: 40, flexDirection: "row", alignItems: "center", gap: 12 },
  back: { width: 30, height: 38, alignItems: "flex-start", justifyContent: "center" },
  brand: { flexDirection: "row", alignItems: "center", gap: 8 },
  brandMark: { width: 28, height: 28, borderRadius: 9, alignItems: "center", justifyContent: "center", backgroundColor: colors.forest },
  brandName: { color: colors.ink, fontSize: 12, fontWeight: "800" },
  heading: { marginTop: 40, marginBottom: 23 },
  eyebrow: { color: colors.leaf, fontSize: 8, fontWeight: "800", letterSpacing: 0.9 },
  title: { marginTop: 7, color: colors.ink, fontFamily: "Georgia", fontSize: 34, fontWeight: "500" },
  subtitle: { maxWidth: 290, marginTop: 6, color: colors.muted, fontSize: 10, lineHeight: 15 },
  form: { gap: 14 },
  field: { gap: 6 },
  label: { color: colors.muted, fontSize: 7, fontWeight: "800", letterSpacing: 0.7 },
  input: { height: 45, paddingHorizontal: 12, paddingRight: 42, borderWidth: 1, borderColor: colors.line, borderRadius: 8, backgroundColor: colors.surface, color: colors.ink, fontSize: 11 },
  eye: { position: "absolute", right: 11, bottom: 12 },
  consent: { minHeight: 34, flexDirection: "row", alignItems: "center", gap: 8 },
  consentText: { flex: 1, color: colors.muted, fontSize: 8, lineHeight: 13 },
  error: { color: "#A25743", fontSize: 9, lineHeight: 14 },
  notice: { color: colors.forest, fontSize: 9, lineHeight: 14 },
  resend: { alignSelf: "flex-start", paddingVertical: 2 },
  resendText: { color: colors.leaf, fontSize: 9, fontWeight: "700" },
  changeEmail: { color: colors.muted, fontSize: 8 },
  submit: { minHeight: 46, borderRadius: 9, alignItems: "center", justifyContent: "center", backgroundColor: colors.forest },
  submitDisabled: { opacity: 0.65 },
  submitText: { color: colors.surface, fontSize: 10, fontWeight: "800" },
  demoNote: { marginTop: -5, color: colors.subtle, fontSize: 7, textAlign: "center" },
  switchRow: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 5, marginTop: "auto", paddingTop: 30 },
  switchText: { color: colors.muted, fontSize: 9 },
  switchLink: { color: colors.forest, fontSize: 9, fontWeight: "800" },
});