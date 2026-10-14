import { PropsWithChildren } from "react";
import { RefreshControl, ScrollView, StyleSheet, View } from "react-native";
import { colors } from "./theme";

type PageShellProps = PropsWithChildren<{ refreshing?: boolean; onRefresh?: () => void }>;

export function PageShell({ children, refreshing = false, onRefresh }: PageShellProps) {
  return (
    <View style={styles.screen}>
      <ScrollView refreshControl={onRefresh ? <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.leaf} colors={[colors.leaf]} /> : undefined} showsVerticalScrollIndicator={false} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {children}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.paper },
  content: { flexGrow: 1, paddingBottom: 30 },
});