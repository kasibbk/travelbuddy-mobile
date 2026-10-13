import { CalendarDays, Map, MapPin, Users } from "lucide-react-native";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { RideCardData, RideRequestData } from "../lib/app-data";
import { colors } from "./theme";

type RideCardProps = {
  ride: RideCardData;
  requestState?: RideRequestData;
  viewerIsOwner?: boolean;
  actionPending?: boolean;
  actionDisabled?: boolean;
  actionError?: string;
  onRequestSpot?: () => void;
  onCancelRequest?: () => void;
};

export function RideCard({ ride, requestState, viewerIsOwner = false, actionPending = false, actionDisabled = false, actionError = "", onRequestSpot, onCancelRequest }: RideCardProps) {
  return (
    <View style={styles.card}>
      <View style={styles.routePreview}><View style={styles.mapIcon}><Map color={colors.leaf} size={18} /></View><Text style={styles.distanceText}>{ride.distance}</Text></View>
      <View style={styles.body}>
        <View style={styles.dateLine}><CalendarDays color={colors.leaf} size={13} /><Text style={styles.dateText}>{ride.date} · {ride.time}</Text></View>
        <Text style={styles.title}>{ride.title}</Text>
        <View style={styles.routeLine}><MapPin color={colors.orange} size={13} /><Text numberOfLines={1} style={styles.routeText}>{ride.route}</Text></View>
        <View style={styles.footer}>
          <View style={styles.riders}><Users color={colors.muted} size={14} /><Text style={styles.riderText}>Up to {ride.capacity} riders</Text></View>
          <Text style={styles.hostText}>{ride.host}</Text>
        </View>
        {viewerIsOwner ? <Text style={styles.ownerNote}>You host this ride</Text> : requestState?.status === "approved" ? <Text style={styles.approvedNote}>Your request is approved</Text> : onRequestSpot ? <Pressable accessibilityRole="button" accessibilityState={{ disabled: actionPending || actionDisabled }} disabled={actionPending || actionDisabled} onPress={requestState?.status === "pending" ? onCancelRequest : onRequestSpot} style={[styles.requestButton, requestState?.status === "pending" && styles.cancelButton, (actionPending || actionDisabled) && styles.pendingButton]}>{actionPending ? <ActivityIndicator size="small" color={requestState?.status === "pending" ? colors.forest : colors.surface} /> : <Text style={[styles.requestButtonText, requestState?.status === "pending" && styles.cancelButtonText]}>{requestState?.status === "pending" ? "Cancel request" : "Request a spot"}</Text>}</Pressable> : null}
        {!!actionError && <Text accessibilityRole="alert" style={styles.actionError}>{actionError}</Text>}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { overflow: "hidden", borderWidth: 1, borderColor: colors.line, borderRadius: 12, backgroundColor: colors.surface },
  routePreview: { height: 86, paddingHorizontal: 13, flexDirection: "row", alignItems: "center", justifyContent: "space-between", backgroundColor: "#E6ECDF" },
  mapIcon: { width: 34, height: 34, borderRadius: 11, alignItems: "center", justifyContent: "center", backgroundColor: colors.surface },
  distanceText: { color: colors.muted, fontSize: 9, fontWeight: "700" },
  body: { paddingHorizontal: 13, paddingTop: 11, paddingBottom: 12 },
  dateLine: { flexDirection: "row", alignItems: "center", gap: 6 },
  dateText: { color: colors.muted, fontSize: 9, fontWeight: "600" },
  title: { marginTop: 7, color: colors.ink, fontFamily: "Georgia", fontSize: 19, fontWeight: "500" },
  routeLine: { marginTop: 6, flexDirection: "row", alignItems: "center", gap: 5 },
  routeText: { flexShrink: 1, color: colors.muted, fontSize: 9 },
  footer: { marginTop: 12, paddingTop: 10, borderTopWidth: 1, borderTopColor: "#EEF0E9", flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
  riders: { flexDirection: "row", alignItems: "center", gap: 5 },
  riderText: { color: colors.muted, fontSize: 8, fontWeight: "600" },
  hostText: { color: colors.forest, fontSize: 8, fontWeight: "700" },
  ownerNote: { marginTop: 11, color: colors.muted, fontSize: 9, fontWeight: "700" },
  approvedNote: { marginTop: 11, color: colors.leaf, fontSize: 9, fontWeight: "700" },
  requestButton: { minHeight: 37, marginTop: 11, borderRadius: 8, alignItems: "center", justifyContent: "center", backgroundColor: colors.forest },
  cancelButton: { borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface },
  pendingButton: { opacity: 0.7 },
  requestButtonText: { color: colors.surface, fontSize: 9, fontWeight: "700" },
  cancelButtonText: { color: colors.forest },
  actionError: { marginTop: 6, color: "#9B493C", fontSize: 8, lineHeight: 12 },
});