import { useEffect } from "react";
import { ActivityIndicator, ImageBackground, Pressable, StyleSheet, Text, View } from "react-native";
import { Bike, ChevronRight, MapPin } from "lucide-react-native";
import { Link, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "../components/auth-provider";
import { useInitialSyncReady } from "../components/sync-provider";
import { colors } from "../components/theme";

const coverImage = "https://images.unsplash.com/photo-1448375240586-882707db888b?auto=format&fit=crop&w=1400&q=90";

export default function SplashScreen() {
  const router = useRouter();
  const { ready, isSignedIn } = useAuth();
  const initialSyncReady = useInitialSyncReady();
  const insets = useSafeAreaInsets();

  useEffect(() => {
    if (ready && isSignedIn && initialSyncReady) router.replace("/(tabs)/discover");
  }, [initialSyncReady, isSignedIn, ready, router]);

  const isLoading = !ready || (isSignedIn && !initialSyncReady);
  const syncMessage = !ready
    ? "Checking your saved session"
    : isSignedIn
      ? "Syncing your rides and messages"
      : "Ready when you are";

  return (
    <View style={styles.screen}>
      <ImageBackground source={{ uri: coverImage }} style={styles.hero} imageStyle={styles.heroImage}>
        <View style={styles.imageShade} />
        <View style={styles.brand}><View style={styles.brandMark}><Bike color={colors.lime} size={19} strokeWidth={2.4} /></View><Text style={styles.brandName}>travelbuddy</Text></View>
        <View style={styles.heroCopy}><View style={styles.location}><MapPin color={colors.lime} size={12} /><Text style={styles.locationText}>THE BAY AREA & BEYOND</Text></View><Text style={styles.heroTitle}>Find the long{ "\n" }way around.</Text><Text style={styles.heroSubtitle}>The best rides start with good people.</Text></View>
      </ImageBackground>
      <View style={[styles.content, { paddingBottom: Math.max(18, insets.bottom + 12) }]}>
        <View><Text style={styles.eyebrow}>GO A LITTLE FURTHER, TOGETHER</Text><Text style={styles.title}>Your next good day{ "\n" }is just around the bend.</Text><Text style={styles.description}>Find a crew, plan a route, and leave room for the scenic way.</Text></View>
        <View style={styles.syncBlock}>
          <View style={styles.syncHeader}>{isLoading ? <ActivityIndicator color={colors.leaf} size="small" /> : <View style={styles.syncDot} />}<Text style={styles.syncMessage}>{syncMessage}</Text></View>
        </View>
        {ready && !isSignedIn && <View style={styles.actions}>
          <Link href="/login" asChild><Pressable style={styles.primary}><Text style={styles.primaryText}>Sign in</Text><ChevronRight color={colors.ink} size={18} /></Pressable></Link>
          <Link href="/register" asChild><Pressable style={styles.secondary}><Text style={styles.secondaryText}>Create an account</Text></Pressable></Link>
        </View>}
        {ready && !isSignedIn && <Text style={styles.demoNote}>Your rides and conversations sync with your account.</Text>}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.paper },
  hero: { minHeight: 350, flex: 1.03, justifyContent: "space-between", paddingHorizontal: 21, paddingTop: 22, paddingBottom: 25, backgroundColor: colors.forest },
  heroImage: { resizeMode: "cover" },
  imageShade: { ...StyleSheet.absoluteFill, backgroundColor: "#132D25A6" },
  brand: { flexDirection: "row", alignItems: "center", gap: 9 },
  brandMark: { width: 33, height: 33, borderRadius: 11, alignItems: "center", justifyContent: "center", backgroundColor: colors.forest },
  brandName: { color: colors.surface, fontSize: 16, fontWeight: "800" },
  heroCopy: { gap: 8 },
  location: { flexDirection: "row", alignItems: "center", gap: 6 },
  locationText: { color: "#DDE8D8", fontSize: 8, fontWeight: "800", letterSpacing: 1 },
  heroTitle: { color: "#FAF9F0", fontFamily: "Georgia", fontSize: 40, lineHeight: 42, fontWeight: "500" },
  heroSubtitle: { color: "#E1E8DD", fontSize: 11 },
  content: { flex: 1, justifyContent: "space-between", paddingHorizontal: 22, paddingTop: 23, paddingBottom: 18 },
  eyebrow: { color: colors.leaf, fontSize: 8, fontWeight: "800", letterSpacing: 1 },
  title: { marginTop: 7, color: colors.ink, fontFamily: "Georgia", fontSize: 25, lineHeight: 29, fontWeight: "500" },
  description: { maxWidth: 300, marginTop: 7, color: colors.muted, fontSize: 10, lineHeight: 15 },
  syncBlock: { marginTop: 16, gap: 7 },
  syncHeader: { flexDirection: "row", alignItems: "center", gap: 7 },
  syncDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.leaf },
  syncMessage: { flex: 1, color: colors.muted, fontSize: 8, fontWeight: "600" },
  actions: { gap: 8, marginTop: 18 },
  primary: { minHeight: 46, paddingHorizontal: 14, borderRadius: 9, backgroundColor: colors.lime, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  primaryText: { color: colors.ink, fontSize: 11, fontWeight: "800" },
  secondary: { minHeight: 44, borderWidth: 1, borderColor: colors.line, borderRadius: 9, alignItems: "center", justifyContent: "center", backgroundColor: colors.surface },
  secondaryText: { color: colors.forest, fontSize: 10, fontWeight: "700" },
  demoNote: { marginTop: 9, color: colors.subtle, fontSize: 7, textAlign: "center" },
});