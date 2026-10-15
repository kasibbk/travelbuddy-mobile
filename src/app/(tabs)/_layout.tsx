import { Tabs } from "expo-router";
import { Compass, MessageCircle, Route, Users } from "lucide-react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors } from "../../components/theme";

export default function TabLayout() {
  const insets = useSafeAreaInsets();

  return (
    <Tabs screenOptions={{
      headerShown: false,
      tabBarActiveTintColor: colors.forest,
      tabBarInactiveTintColor: "#9AA59C",
      tabBarLabelStyle: { fontSize: 9, fontWeight: "700", marginTop: 1 },
      tabBarStyle: { height: 62 + insets.bottom, paddingTop: 7, paddingBottom: Math.max(5, insets.bottom), borderTopColor: colors.line, backgroundColor: "#FFFFFF" },
      tabBarItemStyle: { gap: 1 },
    }}>
      <Tabs.Screen name="discover" options={{ title: "Discover", tabBarIcon: ({ color, size }) => <Compass color={color} size={size} /> }} />
      <Tabs.Screen name="rides" options={{ title: "My rides", tabBarIcon: ({ color, size }) => <Route color={color} size={size} /> }} />
      <Tabs.Screen name="friends" options={{ title: "Friends", tabBarIcon: ({ color, size }) => <Users color={color} size={size} /> }} />
      <Tabs.Screen name="messages" options={{ title: "Messages", tabBarIcon: ({ color, size }) => <MessageCircle color={color} size={size} /> }} />
    </Tabs>
  );
}