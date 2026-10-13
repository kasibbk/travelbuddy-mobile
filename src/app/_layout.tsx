import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import { colors } from "../components/theme";

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <StatusBar style="dark" />
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.paper }} edges={["top"]}>
        <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.paper } }}>
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="profile/index" options={{ presentation: "modal" }} />
          <Stack.Screen name="account/index" options={{ presentation: "modal" }} />
        </Stack>
      </SafeAreaView>
    </SafeAreaProvider>
  );
}