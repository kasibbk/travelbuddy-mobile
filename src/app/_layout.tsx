import { Stack, usePathname, useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useEffect, useRef } from "react";
import { Platform } from "react-native";
import * as Notifications from "expo-notifications";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import { AuthProvider, useAuth } from "../components/auth-provider";
import { SyncProvider } from "../components/sync-provider";
import { colors } from "../components/theme";
import { markNotificationRead, notificationHref } from "../lib/notifications";

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
  const { isSignedIn, userId } = useAuth();
  const lastResponseId = useRef<string | null>(null);

  useEffect(() => {
    if (!isSignedIn || Platform.OS === "web") return;

    function openResponse(response: Notifications.NotificationResponse) {
      const requestId = response.notification.request.identifier;
      if (lastResponseId.current === requestId) return;
      lastResponseId.current = requestId;
      const data = response.notification.request.content.data ?? {};
      const notificationId = typeof data.notificationId === "string" ? data.notificationId : null;
      if (userId && notificationId) {
        void markNotificationRead(userId, notificationId, typeof data.type === "string" ? data.type : "")
          .catch((error: unknown) => console.warn("[notifications] Could not mark push as read", error));
      }
      router.push(notificationHref(data));
      Notifications.clearLastNotificationResponse();
    }

    const subscription = Notifications.addNotificationResponseReceivedListener(openResponse);
    Notifications.getLastNotificationResponseAsync()
      .then((response) => { if (response) openResponse(response); })
      .catch((error: unknown) => console.warn("[notifications] Failed to read the launch response", error));
    return () => subscription.remove();
  }, [isSignedIn, router, userId]);

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
      <Stack.Screen name="notifications" options={{ presentation: "modal" }} />
      <Stack.Screen name="notifications/[group]" />
    </Stack>
  );
}