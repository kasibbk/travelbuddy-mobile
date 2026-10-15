import { PropsWithChildren } from "react";
import { KeyboardAvoidingView, Platform, RefreshControl, ScrollView, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors } from "./theme";

type PageShellProps = PropsWithChildren<{ refreshing?: boolean; onRefresh?: () => void }>;

export function PageShell({ children, refreshing = false, onRefresh }: PageShellProps) {
  const insets = useSafeAreaInsets();

  return (
    <View style={styles.screen}>
      <KeyboardAvoidingView style={styles.keyboard} behavior={Platform.OS === "ios" ? "padding" : Platform.OS === "android" ? "height" : undefined}>
        <ScrollView refreshControl={onRefresh ? <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.leaf} colors={[colors.leaf]} /> : undefined} showsVerticalScrollIndicator={false} contentContainerStyle={[styles.content, { paddingBottom: 30 + insets.bottom }]} keyboardShouldPersistTaps="handled">
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