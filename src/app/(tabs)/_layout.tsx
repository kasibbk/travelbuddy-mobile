import { useEffect, useState } from "react";
import { Tabs, useRouter } from "expo-router";
import { BottomTabBar } from "expo-router/build/layouts/Tabs";
import { ChevronRight, Compass, MessageCircle, Route, Users } from "lucide-react-native";
import { ColorValue, Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "../../components/auth-provider";
import { colors } from "../../components/theme";
import { loadConversations, loadUserRides, type RideCardData } from "../../lib/app-data";
import { loadUnreadNotificationCounts } from "../../lib/notifications";
import { useStoreVersion } from "../../lib/store-events";

export default function TabLayout() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { ready, userId } = useAuth();
  const storeVersion = useStoreVersion();
  const [activity, setActivity] = useState({ userId: "", rides: 0, friends: 0, messages: 0 });
  const [activeRide, setActiveRide] = useState<{ userId: string; ride: RideCardData | null } | null>(null);

  useEffect(() => {
    if (!ready || !userId) return;
    let active = true;
    void Promise.all([loadUnreadNotificationCounts(), loadConversations(userId)])
      .then(([notificationCounts, conversations]) => {
        if (!active) return;
        const rideTypes = ["ride_request", "ride_request_update", "ride_request_cancelled", "ride_update", "ride_admin"];
        const friendTypes = ["friend_request", "friend_accepted", "friend_declined"];
        setActivity({
          userId,
          rides: rideTypes.reduce((total, type) => total + (notificationCounts[type] ?? 0), 0),
          friends: friendTypes.reduce((total, type) => total + (notificationCounts[type] ?? 0), 0),
          messages: conversations.reduce((total, conversation) => total + conversation.unreadCount, 0),
        });
      })
      .catch((error: unknown) => {
        if (active) console.warn("[navigation] Could not load unread activity counts", error);
      });
    void loadUserRides(userId)
      .then((rides) => {
        if (!active) return;
        const currentRide = rides
          .filter((ride) => ride.status === "started")
          .sort((left, right) => right.startsAt.localeCompare(left.startsAt))[0] ?? null;
        setActiveRide({ userId, ride: currentRide });
      })
      .catch((error: unknown) => {
        if (active) console.warn("[navigation] Could not load active ride", error);
      });
    return () => { active = false; };
  }, [ready, userId, storeVersion]);
  const unreadByTab = activity.userId === userId ? activity : { rides: 0, friends: 0, messages: 0 };
  const activeRideForUser = userId && activeRide?.userId === userId ? activeRide.ride : null;

  return (
    <Tabs
      tabBar={(props) => (
        <View style={styles.tabBarContainer}>
          {activeRideForUser && (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Open live map for ${activeRideForUser.title}`}
              onPress={() => router.push({ pathname: "/rides/[id]/map", params: { id: activeRideForUser.id, source: "active-ride-banner" } })}
              style={styles.activeRideBanner}
            >
              <View style={styles.activeRideIcon}><Route color={colors.forest} size={19} /></View>
              <View style={styles.activeRideCopy}>
                <View style={styles.activeRideEyebrow}>
                  <View style={styles.liveDot} />
                  <Text style={styles.activeRideLabel}>LIVE RIDE</Text>
                </View>
                <Text numberOfLines={1} style={styles.activeRideTitle}>{activeRideForUser.title}</Text>
                <Text numberOfLines={1} style={styles.activeRideRoute}>{activeRideForUser.route}</Text>
              </View>
              <ChevronRight color="#FFFFFF" size={20} />
            </Pressable>
          )}
          <BottomTabBar {...props} />
        </View>
      )}
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.forest,
        tabBarInactiveTintColor: "#9AA59C",
        tabBarLabelStyle: { fontSize: 9, fontWeight: "700", marginTop: 1 },
        tabBarStyle: { height: 62 + insets.bottom, paddingTop: 7, paddingBottom: Math.max(5, insets.bottom), borderTopColor: colors.line, backgroundColor: "#FFFFFF" },
        tabBarItemStyle: { gap: 1 },
      }}
    >
      <Tabs.Screen name="discover" options={{ title: "Discover", tabBarIcon: ({ color, size }) => <TabIcon Icon={Compass} color={color} size={size} /> }} />
      <Tabs.Screen name="rides" options={{ title: "My rides", tabBarIcon: ({ color, size }) => <TabIcon Icon={Route} color={color} size={size} count={unreadByTab.rides} /> }} />
      <Tabs.Screen name="friends" options={{ title: "Friends", tabBarIcon: ({ color, size }) => <TabIcon Icon={Users} color={color} size={size} count={unreadByTab.friends} /> }} />
      <Tabs.Screen name="messages" options={{ title: "Messages", tabBarIcon: ({ color, size }) => <TabIcon Icon={MessageCircle} color={color} size={size} count={unreadByTab.messages} /> }} />
    </Tabs>
  );
}

function TabIcon({ Icon, color, size, count = 0 }: { Icon: typeof Compass; color: ColorValue; size: number; count?: number }) {
  return <View style={styles.icon}>
    <Icon color={color} size={size} />
    {count > 0 && <View style={styles.badge}><Text style={styles.badgeText}>{count > 99 ? "99+" : count}</Text></View>}
  </View>;
}

const styles = StyleSheet.create({
  tabBarContainer: { backgroundColor: "#FFFFFF" },
  activeRideBanner: { minHeight: 66, marginHorizontal: 12, marginTop: 8, marginBottom: 5, paddingHorizontal: 12, paddingVertical: 9, borderRadius: 16, flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: colors.forest },
  activeRideIcon: { width: 36, height: 36, borderRadius: 12, alignItems: "center", justifyContent: "center", backgroundColor: colors.paleGreen },
  activeRideCopy: { flex: 1, minWidth: 0, gap: 1 },
  activeRideEyebrow: { flexDirection: "row", alignItems: "center", gap: 5 },
  liveDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.lime },
  activeRideLabel: { color: colors.lime, fontSize: 9, fontWeight: "800", letterSpacing: 0.6 },
  activeRideTitle: { color: "#FFFFFF", fontSize: 13, fontWeight: "800" },
  activeRideRoute: { color: "#DCE7DE", fontSize: 10, fontWeight: "500" },
  icon: { position: "relative" },
  badge: { position: "absolute", top: -7, right: -13, minWidth: 16, height: 16, paddingHorizontal: 3, borderRadius: 8, alignItems: "center", justifyContent: "center", borderWidth: 1.5, borderColor: "#FFFFFF", backgroundColor: colors.orange },
  badgeText: { color: "#FFFFFF", fontSize: 7, fontWeight: "800" },
});