import { ArrowLeft, ChevronRight, LogOut, ShieldCheck } from "lucide-react-native";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { useAuth } from "../../components/auth-provider";
import { colors } from "../../components/theme";

export default function AccountSettingsScreen() {
  const router = useRouter();
  const { userEmail, signOut } = useAuth();

  return <View style={styles.screen}>
    <View style={styles.topbar}><Pressable accessibilityLabel="Back to profile" onPress={() => router.back()} style={styles.back}><ArrowLeft color={colors.ink} size={19} /></Pressable><Text style={styles.topbarTitle}>Account &amp; sign-in</Text></View>
    <ScrollView contentContainerStyle={styles.content}>
      <Text style={styles.eyebrow}>YOUR ACCOUNT</Text>
      <Text style={styles.title}>Your TravelBuddy account</Text>
      <Text style={styles.subtitle}>Your sign-in and security are managed by Supabase.</Text>
      <View style={styles.accountCard}><View style={styles.cardHeader}><View><Text style={styles.fieldLabel}>SIGNED IN WITH</Text><Text style={styles.email}>{userEmail ?? "No email on this session"}</Text></View><ShieldCheck color={colors.leaf} size={20} /></View><View style={styles.divider} /><View style={styles.settingRow}><View><Text style={styles.settingTitle}>Password</Text><Text style={styles.settingDetail}>Managed securely by Supabase Auth</Text></View><ChevronRight color={colors.muted} size={16} /></View><View style={styles.settingRow}><View><Text style={styles.settingTitle}>Email verification</Text><Text style={styles.settingDetail}>Confirmation depends on your Supabase Auth settings</Text></View></View></View>
      <Pressable accessibilityRole="button" onPress={signOut} style={styles.signOut}><LogOut color="#9B684F" size={16} /><Text style={styles.signOutText}>Sign out</Text></Pressable>
    </ScrollView>
  </View>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.paper },
  topbar: { height: 54, paddingHorizontal: 17, flexDirection: "row", alignItems: "center", gap: 11 },
  back: { width: 28, height: 38, alignItems: "flex-start", justifyContent: "center" },
  topbarTitle: { color: colors.ink, fontSize: 12, fontWeight: "700" },
  content: { flexGrow: 1, paddingHorizontal: 19, paddingTop: 24, paddingBottom: 26 },
  eyebrow: { color: colors.leaf, fontSize: 8, fontWeight: "800", letterSpacing: 1 },
  title: { marginTop: 7, color: colors.ink, fontFamily: "Georgia", fontSize: 27, fontWeight: "500" },
  subtitle: { maxWidth: 300, marginTop: 6, color: colors.muted, fontSize: 10, lineHeight: 15 },
  accountCard: { marginTop: 20, paddingHorizontal: 14, paddingTop: 14, borderWidth: 1, borderColor: colors.line, borderRadius: 12, backgroundColor: colors.surface },
  cardHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  fieldLabel: { color: colors.muted, fontSize: 7, fontWeight: "800", letterSpacing: 0.7 },
  email: { marginTop: 5, color: colors.ink, fontSize: 10, fontWeight: "700" },
  divider: { height: 1, marginTop: 13, backgroundColor: colors.line },
  settingRow: { minHeight: 53, borderBottomWidth: 1, borderBottomColor: colors.line, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
  settingTitle: { color: colors.ink, fontSize: 9, fontWeight: "700" },
  settingDetail: { maxWidth: 265, marginTop: 3, color: colors.muted, fontSize: 8 },
  signOut: { minHeight: 44, marginTop: 13, paddingHorizontal: 12, borderWidth: 1, borderColor: "#EADFD8", borderRadius: 9, backgroundColor: "#FBF7F4", flexDirection: "row", alignItems: "center", gap: 8 },
  signOutText: { color: "#9B684F", fontSize: 10, fontWeight: "700" },
});