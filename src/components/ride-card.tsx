import { ArrowRight, CalendarDays, MapPin, Users } from "lucide-react-native";
import { ImageBackground, Pressable, StyleSheet, Text, View } from "react-native";
import { Ride } from "../lib/demo-data";
import { colors } from "./theme";

type RideCardProps = { ride: Ride; requested?: boolean; onJoin?: () => void };

export function RideCard({ ride, requested = false, onJoin }: RideCardProps) {
  return (
    <View style={styles.card}>
      <ImageBackground source={{ uri: ride.image }} style={styles.image} imageStyle={styles.imageShape}>
        <Text style={styles.tag}>{ride.tag}</Text>
        <View style={styles.distancePill}><Text style={styles.distanceText}>{ride.distance}</Text></View>
      </ImageBackground>
      <View style={styles.body}>
        <View style={styles.dateLine}><CalendarDays color={colors.leaf} size={13} /><Text style={styles.dateText}>{ride.date} · {ride.time}</Text></View>
        <Text style={styles.title}>{ride.title}</Text>
        <View style={styles.routeLine}><MapPin color={colors.orange} size={13} /><Text numberOfLines={1} style={styles.routeText}>{ride.route}</Text></View>
        <View style={styles.footer}>
          <View style={styles.riders}><Users color={colors.muted} size={14} /><Text style={styles.riderText}>{ride.riders} riding · {ride.spots} spots</Text></View>
          <Pressable accessibilityRole="button" onPress={onJoin} style={[styles.joinButton, requested && styles.joined]}><Text style={[styles.joinText, requested && styles.joinedText]}>{requested ? "Requested" : "Join"}</Text>{!requested && <ArrowRight color={colors.forest} size={13} />}</Pressable>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { overflow: "hidden", borderWidth: 1, borderColor: colors.line, borderRadius: 12, backgroundColor: colors.surface },
  image: { height: 145, justifyContent: "space-between", alignItems: "flex-start", padding: 11, flexDirection: "row" },
  imageShape: { resizeMode: "cover" },
  tag: { overflow: "hidden", paddingHorizontal: 9, paddingVertical: 6, borderRadius: 20, backgroundColor: "#F7F7EDEB", color: colors.forest, fontSize: 9, fontWeight: "700" },
  distancePill: { paddingHorizontal: 9, paddingVertical: 6, borderRadius: 20, backgroundColor: "#17382DBB" },
  distanceText: { color: colors.surface, fontSize: 9, fontWeight: "700" },
  body: { paddingHorizontal: 13, paddingTop: 11, paddingBottom: 12 },
  dateLine: { flexDirection: "row", alignItems: "center", gap: 6 },
  dateText: { color: colors.muted, fontSize: 9, fontWeight: "600" },
  title: { marginTop: 7, color: colors.ink, fontFamily: "Georgia", fontSize: 19, fontWeight: "500" },
  routeLine: { marginTop: 6, flexDirection: "row", alignItems: "center", gap: 5 },
  routeText: { flexShrink: 1, color: colors.muted, fontSize: 9 },
  footer: { marginTop: 12, paddingTop: 10, borderTopWidth: 1, borderTopColor: "#EEF0E9", flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
  riders: { flexDirection: "row", alignItems: "center", gap: 5 },
  riderText: { color: colors.muted, fontSize: 8, fontWeight: "600" },
  joinButton: { minHeight: 30, paddingHorizontal: 10, borderWidth: 1, borderColor: "#DDE6D8", borderRadius: 7, flexDirection: "row", alignItems: "center", gap: 5 },
  joinText: { color: colors.forest, fontSize: 9, fontWeight: "700" },
  joined: { borderColor: "#E4EBD8", backgroundColor: colors.paleGreen },
  joinedText: { color: colors.forest },
});