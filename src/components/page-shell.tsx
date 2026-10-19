import { PropsWithChildren, useEffect, useRef } from "react";
import { Keyboard, KeyboardAvoidingView, Platform, RefreshControl, ScrollView, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors } from "./theme";

type PageShellProps = PropsWithChildren<{ refreshing?: boolean; onRefresh?: () => void; focusedFieldY?: number | null }>;

export function PageShell({ children, refreshing = false, onRefresh, focusedFieldY }: PageShellProps) {
  const insets = useSafeAreaInsets();
  const scrollRef = useRef<ScrollView>(null);
  const focusedFieldYRef = useRef(focusedFieldY);

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

  return (
    <View style={styles.screen}>
      <KeyboardAvoidingView style={styles.keyboard} behavior={Platform.OS === "ios" ? "padding" : Platform.OS === "android" ? "height" : undefined}>
        <ScrollView ref={scrollRef} automaticallyAdjustKeyboardInsets={Platform.OS === "ios"} refreshControl={onRefresh ? <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.leaf} colors={[colors.leaf]} /> : undefined} showsVerticalScrollIndicator={false} contentContainerStyle={[styles.content, { paddingBottom: 30 + insets.bottom }]} keyboardShouldPersistTaps="handled">
          {children}
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.paper },
  keyboard: { flex: 1 },
  content: { flexGrow: 1, paddingBottom: 30 },
});