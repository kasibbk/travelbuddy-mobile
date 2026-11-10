import { Navigation } from "lucide-react-native";
import { StyleProp, StyleSheet, Text, View, ViewStyle } from "react-native";
import { colors } from "./theme";
import { formatManeuverDistance, type NavigationGuidance } from "../services/location/navigation-guidance";

type NavigationGuidanceCardProps = {
  guidance: NavigationGuidance | null;
  style?: StyleProp<ViewStyle>;
};

export function NavigationGuidanceCard({ guidance, style }: NavigationGuidanceCardProps) {
  if (!guidance?.nextInstruction || guidance.distanceToNextManeuverMeters === null) return null;

  return <View style={[styles.card, style]}>
    <View style={styles.icon}><Navigation color={colors.forest} size={19} /></View>
    <View style={styles.copy}>
      <Text style={styles.eyebrow}>UP NEXT</Text>
      <Text numberOfLines={2} style={styles.instruction}>{guidance.nextInstruction}</Text>
    </View>
    <Text style={styles.distance}>{formatManeuverDistance(guidance.distanceToNextManeuverMeters)}</Text>
  </View>;
}

const styles = StyleSheet.create({
  card: { minHeight: 66, padding: 10, flexDirection: "row", alignItems: "center", gap: 9, borderWidth: 1, borderColor: colors.line, borderRadius: 13, backgroundColor: colors.surface, shadowColor: "#000000", shadowOpacity: 0.14, shadowRadius: 8, elevation: 4 },
  icon: { width: 36, height: 36, alignItems: "center", justifyContent: "center", borderRadius: 10, backgroundColor: colors.paleGreen },
  copy: { flex: 1, minWidth: 0, gap: 3 },
  eyebrow: { color: colors.muted, fontSize: 7, fontWeight: "800", letterSpacing: 0.7 },
  instruction: { color: colors.ink, fontSize: 10, fontWeight: "800", lineHeight: 14 },
  distance: { color: colors.forest, fontSize: 10, fontWeight: "800" },
});
