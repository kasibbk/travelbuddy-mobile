import { LucideIcon } from "lucide-react-native";
import { StyleSheet, Text, View } from "react-native";
import { colors } from "./theme";

type EmptyStateProps = { icon: LucideIcon; title: string; description: string };

export function EmptyState({ icon: Icon, title, description }: EmptyStateProps) {
  return <View style={styles.card}><View style={styles.iconWrap}><Icon color={colors.leaf} size={20} /></View><Text style={styles.title}>{title}</Text><Text style={styles.description}>{description}</Text></View>;
}

const styles = StyleSheet.create({
  card: { marginHorizontal: 16, marginTop: 4, paddingHorizontal: 22, paddingVertical: 24, alignItems: "center", borderWidth: 1, borderColor: colors.line, borderStyle: "dashed", borderRadius: 12, backgroundColor: "#FAFBF7" },
  iconWrap: { width: 42, height: 42, marginBottom: 11, borderRadius: 21, alignItems: "center", justifyContent: "center", backgroundColor: colors.paleGreen },
  title: { color: colors.ink, fontFamily: "Georgia", fontSize: 17, fontWeight: "500", textAlign: "center" },
  description: { maxWidth: 280, marginTop: 6, color: colors.muted, fontSize: 9, lineHeight: 14, textAlign: "center" },
});