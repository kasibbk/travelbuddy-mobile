import { PropsWithChildren } from "react";
import { ScrollView, StyleSheet, View } from "react-native";
import { colors } from "./theme";

export function PageShell({ children }: PropsWithChildren) {
  return (
    <View style={styles.screen}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {children}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.paper },
  content: { flexGrow: 1, paddingBottom: 30 },
});