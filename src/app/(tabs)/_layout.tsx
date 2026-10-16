import { useEffect, useState } from "react";
import { Tabs } from "expo-router";
import { Compass, MessageCircle, Route, Users } from "lucide-react-native";
import { ColorValue, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "../../components/auth-provider";
import { colors } from "../../components/theme";
import { loadConversations } from "../../lib/app-data";
import { loadUnreadNotificationCounts } from "../../lib/notifications";
import { useStoreVersion } from "../../lib/store-events";

export default function TabLayout() {
  const insets = useSafeAreaInsets();
  const { ready, userId } = useAuth();
  const storeVersion = useStoreVersion();
  const [activity, setActivity] = useState({ userId: "", rides: 0, friends: 0, messages: 0 });

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
    return () => { active = false; };
  }, [ready, userId, storeVersion]);
  const unreadByTab = activity.userId === userId ? activity : { rides: 0, friends: 0, messages: 0 };

  return (
    <Tabs screenOptions={{
      headerShown: false,
      tabBarActiveTintColor: colors.forest,
      tabBarInactiveTintColor: "#9AA59C",
      tabBarLabelStyle: { fontSize: 9, fontWeight: "700", marginTop: 1 },
      tabBarStyle: { height: 62 + insets.bottom, paddingTop: 7, paddingBottom: Math.max(5, insets.bottom), borderTopColor: colors.line, backgroundColor: "#FFFFFF" },
      tabBarItemStyle: { gap: 1 },
    }}>
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
  icon: { position: "relative" },
  badge: { position: "absolute", top: -7, right: -13, minWidth: 16, height: 16, paddingHorizontal: 3, borderRadius: 8, alignItems: "center", justifyContent: "center", borderWidth: 1.5, borderColor: "#FFFFFF", backgroundColor: colors.orange },
  badgeText: { color: "#FFFFFF", fontSize: 7, fontWeight: "800" },
});