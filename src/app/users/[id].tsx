import { useCallback, useState } from "react";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { ArrowLeft, Bike, MapPin, MessageCircle, UserPlus, Users } from "lucide-react-native";
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { useAuth } from "../../components/auth-provider";
import { useStoreVersion } from "../../lib/store-events";
import { Avatar } from "../../components/avatar";
import { EmptyState } from "../../components/empty-state";
import { colors } from "../../components/theme";
import { createDirectConversation, createFriendRequest, FriendData, loadFriendRequests, loadPublicProfile, PublicProfileData } from "../../lib/app-data";

export default function PublicUserProfileScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { ready, userId } = useAuth();
  const [profile, setProfile] = useState<PublicProfileData | null>(null);
  const [friendship, setFriendship] = useState<FriendData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const storeVersion = useStoreVersion();

  useFocusEffect(useCallback(() => {
    if (!ready || !userId || !id || Array.isArray(id)) return;
    if (id === userId) { router.replace("/profile"); return; }
    let active = true;
    setError("");
    Promise.all([loadPublicProfile(id, userId), loadFriendRequests(userId)])
      .then(([row, friendships]) => {
        if (!active) return;
        setProfile(row);
        setFriendship(friendships.find((item) => item.otherUserId === id) ?? null);
      })
      .catch((cause: unknown) => { if (active) setError(cause instanceof Error ? cause.message : "Could not load this profile."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [ready, userId, id, router, storeVersion]));

  async function refreshProfile() {
    if (!userId || !id || Array.isArray(id) || refreshing) return;
    setRefreshing(true);
    setError("");
    try {
      const [row, friendships] = await Promise.all([loadPublicProfile(id, userId, true), loadFriendRequests(userId, true)]);
      setProfile(row);
      setFriendship(friendships.find((item) => item.otherUserId === id) ?? null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not refresh this profile.");
    } finally {
      setRefreshing(false);
    }
  }

  async function sendFriendRequest() {
    if (!userId || !id || Array.isArray(id) || busy) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await createFriendRequest(userId, id);
      setFriendship((await loadFriendRequests(userId)).find((item) => item.otherUserId === id) ?? null);
      setNotice("Friend request sent.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not send the friend request.");
    } finally {
      setBusy(false);
    }
  }

  async function openChat() {
    if (!id || Array.isArray(id) || busy) return;
    setBusy(true);
    setError("");
    try {
      const conversationId = await createDirectConversation(id, userId ?? "");
      router.push({ pathname: "/chat/[id]", params: { id: conversationId, title: profile?.displayName ?? "Friend" } });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not open this conversation.");
    } finally {
      setBusy(false);
    }
  }

  const initials = profile?.displayName.split(/\s+/).map((part) => part[0]).join("").slice(0, 2).toUpperCase() ?? "";
  const pace = profile?.ridingPace ? profile.ridingPace[0].toUpperCase() + profile.ridingPace.slice(1) : "Not shared";

  return <View style={styles.screen}>
    <View style={styles.header}><Pressable accessibilityLabel="Back" onPress={() => router.back()} style={styles.back}><ArrowLeft color={colors.ink} size={19} /></Pressable><Text style={styles.headerTitle}>Rider profile</Text></View>
    {loading ? <ActivityIndicator color={colors.leaf} style={styles.loader} /> : error && !profile ? <EmptyState icon={Users} title="Profile unavailable" description={error} /> : profile ? <ScrollView refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refreshProfile} tintColor={colors.leaf} colors={[colors.leaf]} />} contentContainerStyle={styles.content}>
      <View style={styles.profileCard}><Avatar initials={initials || "R"} size={62} /><Text style={styles.name}>{profile.displayName}</Text>
        {!!profile.homeCity && <View style={styles.city}><MapPin color={colors.leaf} size={13} /><Text style={styles.cityText}>{profile.homeCity}</Text></View>}
        <Text style={styles.bio}>{profile.bio || "No bio shared."}</Text>
        <View style={styles.pace}><Bike color={colors.leaf} size={14} /><Text style={styles.paceText}>{pace} pace</Text></View>
      </View>
      {!!error && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
      {!!notice && <Text accessibilityRole="alert" style={styles.notice}>{notice}</Text>}
      {friendship?.status === "accepted" ? <Pressable accessibilityRole="button" disabled={busy} onPress={openChat} style={styles.primaryButton}>{busy ? <ActivityIndicator color={colors.surface} /> : <><MessageCircle color={colors.surface} size={15} /><Text style={styles.buttonText}>Message</Text></>}</Pressable> : friendship?.status === "pending" ? <View style={styles.state}><Text style={styles.stateText}>{friendship.direction === "outgoing" ? "Friend request sent" : "Respond to this request in Friends"}</Text></View> : <Pressable accessibilityRole="button" disabled={busy} onPress={sendFriendRequest} style={styles.primaryButton}>{busy ? <ActivityIndicator color={colors.surface} /> : <><UserPlus color={colors.surface} size={15} /><Text style={styles.buttonText}>Add friend</Text></>}</Pressable>}
    </ScrollView> : <EmptyState icon={Users} title="Profile unavailable" description="This rider hasn’t shared a public profile, or the account no longer exists." />}
  </View>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.paper },
  header: { height: 54, paddingHorizontal: 17, flexDirection: "row", alignItems: "center", gap: 10 },
  back: { width: 28, height: 38, justifyContent: "center" },
  headerTitle: { color: colors.ink, fontSize: 12, fontWeight: "700" },
  content: { flexGrow: 1, paddingHorizontal: 16, paddingTop: 12, paddingBottom: 24 },
  profileCard: { padding: 20, alignItems: "center", borderWidth: 1, borderColor: colors.line, borderRadius: 12, backgroundColor: colors.surface },
  name: { marginTop: 12, color: colors.ink, fontFamily: "Georgia", fontSize: 23 },
  city: { marginTop: 7, flexDirection: "row", alignItems: "center", gap: 5 },
  cityText: { color: colors.muted, fontSize: 9 },
  bio: { marginTop: 14, color: colors.ink, fontSize: 10, lineHeight: 16, textAlign: "center" },
  pace: { marginTop: 14, paddingHorizontal: 10, paddingVertical: 7, borderRadius: 7, backgroundColor: colors.paleGreen, flexDirection: "row", alignItems: "center", gap: 6 },
  paceText: { color: colors.forest, fontSize: 8, fontWeight: "700" },
  primaryButton: { minHeight: 42, marginTop: 12, borderRadius: 8, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 7, backgroundColor: colors.forest },
  buttonText: { color: colors.surface, fontSize: 10, fontWeight: "700" },
  state: { minHeight: 42, marginTop: 12, alignItems: "center", justifyContent: "center" },
  stateText: { color: colors.muted, fontSize: 9, fontWeight: "700" },
  error: { marginTop: 9, color: "#9B493C", fontSize: 8, lineHeight: 12 },
  notice: { marginTop: 9, color: colors.leaf, fontSize: 8, lineHeight: 12 },
  loader: { marginTop: 28 },
});