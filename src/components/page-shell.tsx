import { createContext, PropsWithChildren, useCallback, useEffect, useRef, useState } from "react";
import { Keyboard, KeyboardAvoidingView, Platform, RefreshControl, ScrollView, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors } from "./theme";
import { FloatingActionMenu } from "./floating-action-menu";
import { AppHeaderProvider, AppTopBar } from "./app-header";
import type { RideCardData } from "../lib/app-data";

export const PageScrollLockContext = createContext<((locked: boolean) => void) | null>(null);

type PageShellProps = PropsWithChildren<{
  refreshing?: boolean;
  onRefresh?: () => void;
  focusedFieldY?: number | null;
  showFloatingActions?: boolean;
  showAppTopBar?: boolean;
  onRideCreated?: (ride: RideCardData) => void;
}>;

export function PageShell({ children, refreshing = false, onRefresh, focusedFieldY, showFloatingActions = false, showAppTopBar = false, onRideCreated }: PageShellProps) {
  const insets = useSafeAreaInsets();
  const scrollRef = useRef<ScrollView>(null);
  const focusedFieldYRef = useRef(focusedFieldY);
  const [scrollLocked, setScrollLocked] = useState(false);
  const setMapInteraction = useCallback((locked: boolean) => setScrollLocked(locked), []);

  useEffect(() => {
    focusedFieldYRef.current = focusedFieldY;
  }, [focusedFieldY]);

  useEffect(() => {
    const subscription = Keyboard.addListener("keyboardDidShow", () => {
      const fieldY = focusedFieldYRef.current;
      if (fieldY !== null && fieldY !== undefined) {
        scrollRef.current?.scrollTo({ y: Math.max(0, fieldY - 24), animated: true });
      }
    });
    return () => subscription.remove();
  }, []);

  const content = <View style={styles.screen}>
        {showAppTopBar && <AppTopBar />}
        <KeyboardAvoidingView style={styles.keyboard} behavior={Platform.OS === "ios" ? "padding" : Platform.OS === "android" ? "height" : undefined}>
          <ScrollView ref={scrollRef} scrollEnabled={!scrollLocked} automaticallyAdjustKeyboardInsets={Platform.OS === "ios"} refreshControl={onRefresh ? <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.leaf} colors={[colors.leaf]} /> : undefined} showsVerticalScrollIndicator={false} contentContainerStyle={[styles.content, { paddingBottom: 30 + insets.bottom }]} keyboardShouldPersistTaps="handled">
            {children}
          </ScrollView>
        </KeyboardAvoidingView>
        {showFloatingActions && <FloatingActionMenu onRideCreated={onRideCreated} />}
      </View>;

  return <PageScrollLockContext.Provider value={setMapInteraction}>
    {showAppTopBar ? <AppHeaderProvider>{content}</AppHeaderProvider> : content}
  </PageScrollLockContext.Provider>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.paper },
  keyboard: { flex: 1 },
  content: { flexGrow: 1, paddingBottom: 30 },
});