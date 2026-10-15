import { Stack, usePathname, useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useEffect } from "react";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import { AuthProvider, useAuth } from "../components/auth-provider";
import { SyncProvider } from "../components/sync-provider";
import { colors } from "../components/theme";

export default function RootLayout() {
  return (
    <AuthProvider>
      <SafeAreaProvider>
        <StatusBar style="dark" />
        <SafeAreaView style={{ flex: 1, backgroundColor: colors.paper }} edges={["top"]}>
          <SyncProvider><RouteGuard /></SyncProvider>
        </SafeAreaView>
      </SafeAreaProvider>
    </AuthProvider>
  );
}

function RouteGuard() {
  const pathname = usePathname();
  const router = useRouter();
  const { isSignedIn } = useAuth();

  useEffect(() => {
    const isAuthRoute = pathname === "/login" || pathname === "/register";
    const isPublicRoute = pathname === "/" || isAuthRoute;
    if (!isSignedIn && !isPublicRoute) router.replace("/");
    if (isSignedIn && pathname === "/account") router.replace("/account/settings");
    if (isSignedIn && isAuthRoute) router.replace("/(tabs)/discover");
  }, [isSignedIn, pathname, router]);

  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.paper } }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="login" />
      <Stack.Screen name="register" />
      <Stack.Screen name="(tabs)" />
      <Stack.Screen name="profile/index" options={{ presentation: "modal" }} />
      <Stack.Screen name="account/index" options={{ presentation: "modal" }} />
      <Stack.Screen name="account/settings" options={{ presentation: "modal" }} />
    </Stack>
  );
}