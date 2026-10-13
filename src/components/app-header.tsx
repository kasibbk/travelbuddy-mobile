import { Bike, Bell, MapPin, Plus } from "lucide-react-native";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { Avatar } from "./avatar";
import { colors } from "./theme";

type AppHeaderProps = {
  eyebrow: string;
  title: string;
  subtitle?: string;
  onCreate?: () => void;
};

export function AppHeader({ eyebrow, title, subtitle, onCreate }: AppHeaderProps) {
  const router = useRouter();

  return (
    <View style={styles.wrapper}>
      <View style={styles.topRow}>
        <View style={styles.brand}>
          <View style={styles.brandMark}><Bike color={colors.lime} size={19} strokeWidth={2.4} /></View>
          <Text style={styles.brandName}>travelbuddy</Text>
        </View>
        <View style={styles.topActions}>
          {onCreate && <Pressable accessibilityLabel="Create a ride" onPress={onCreate} style={styles.createIcon}><Plus color={colors.surface} size={19} /></Pressable>}
          <Pressable accessibilityLabel="Notifications" style={styles.iconButton}><Bell color={colors.ink} size={18} /><View style={styles.notificationDot} /></Pressable>
          <Pressable accessibilityLabel="Open profile" onPress={() => router.push("/profile")}><Avatar initials="JD" size={36} /></Pressable>
        </View>
      </View>
      <View style={styles.titleBlock}>
        <View style={styles.eyebrowRow}><Text style={styles.eyebrow}>{eyebrow}</Text><View style={styles.location}><MapPin color={colors.orange} size={12} /><Text style={styles.locationText}>SAN FRANCISCO</Text></View></View>
        <Text style={styles.title}>{title}</Text>
        {subtitle && <Text style={styles.subtitle}>{subtitle}</Text>}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 18, backgroundColor: colors.paper },
  topRow: { minHeight: 42, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  brand: { flexDirection: "row", alignItems: "center", gap: 9 },
  brandMark: { width: 31, height: 31, borderRadius: 10, alignItems: "center", justifyContent: "center", backgroundColor: colors.forest },
  brandName: { color: colors.ink, fontSize: 15, fontWeight: "800" },
  topActions: { flexDirection: "row", alignItems: "center", gap: 11 },
  createIcon: { width: 34, height: 34, borderRadius: 11, alignItems: "center", justifyContent: "center", backgroundColor: colors.forest },
  iconButton: { width: 34, height: 34, borderRadius: 17, alignItems: "center", justifyContent: "center", position: "relative" },
  notificationDot: { position: "absolute", top: 6, right: 6, width: 6, height: 6, borderRadius: 3, backgroundColor: colors.orange, borderWidth: 1, borderColor: colors.paper },
  titleBlock: { paddingTop: 22 },
  eyebrowRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
  eyebrow: { color: colors.muted, fontSize: 9, fontWeight: "800", letterSpacing: 1.1 },
  location: { flexDirection: "row", alignItems: "center", gap: 4 },
  locationText: { color: colors.muted, fontSize: 8, fontWeight: "700", letterSpacing: 0.7 },
  title: { marginTop: 7, color: colors.ink, fontFamily: "Georgia", fontSize: 30, fontWeight: "500", letterSpacing: 0 },
  subtitle: { marginTop: 5, color: colors.muted, fontSize: 11, lineHeight: 16 },
});