import { useState } from "react";
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { ShieldCheck, UserPlus, Users, X } from "lucide-react-native";
import { EmptyState } from "./empty-state";
import { colors } from "./theme";
import { assignRideAdmin, FriendData, RideAdminData, RideCardData } from "../lib/app-data";

type AssignRideAdminModalProps = {
  visible: boolean;
  ride: RideCardData | null;
  friends: FriendData[];
  admins: RideAdminData[];
  assignedBy: string;
  onClose: () => void;
  onAssigned: (friend: FriendData) => void;
};

export function AssignRideAdminModal({ visible, ride, friends, admins, assignedBy, onClose, onAssigned }: AssignRideAdminModalProps) {
  const [assigningUserId, setAssigningUserId] = useState("");
  const [error, setError] = useState("");
  if (!ride) return null;
  const selectedRide = ride;

  const candidates = friends.filter((friend) => friend.status === "accepted" && !admins.some((admin) => admin.userId === friend.otherUserId));

  async function assign(friend: FriendData) {
    if (assigningUserId) return;
    setAssigningUserId(friend.otherUserId);
    setError("");
    try {
      await assignRideAdmin(selectedRide.id, friend.otherUserId, assignedBy);
      onAssigned(friend);
      onClose();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not assign this ride admin.");
    } finally {
      setAssigningUserId("");
    }
  }

  return <Modal visible={visible} transparent animationType="slide" onRequestClose={() => { if (!assigningUserId) onClose(); }}>
    <View style={styles.backdrop}><View style={styles.sheet}>
      <View style={styles.header}><View style={styles.headerIcon}><ShieldCheck color={colors.lime} size={17} /></View><View style={styles.headingCopy}><Text style={styles.title}>Assign a co-admin</Text><Text numberOfLines={1} style={styles.subtitle}>{selectedRide.title}</Text></View><Pressable accessibilityLabel="Close" disabled={!!assigningUserId} onPress={onClose} style={styles.closeButton}><X color={colors.muted} size={19} /></Pressable></View>
      <Text style={styles.helper}>A co-admin can review requests and help manage this ride.</Text>
      <ScrollView style={styles.list} contentContainerStyle={styles.listContent}>
        {candidates.length ? candidates.map((friend) => {
          const initials = friend.name.split(/\s+/).map((part) => part[0]).join("").slice(0, 2).toUpperCase();
          const isAssigning = assigningUserId === friend.otherUserId;
          return <View key={friend.otherUserId} style={styles.friendRow}><View style={styles.avatar}><Text style={styles.avatarText}>{initials}</Text></View><View style={styles.friendCopy}><Text numberOfLines={1} style={styles.friendName}>{friend.name}</Text><Text style={styles.friendDetail}>Accepted friend</Text></View><Pressable accessibilityLabel={`Assign ${friend.name} as co-admin`} accessibilityState={{ disabled: !!assigningUserId }} disabled={!!assigningUserId} onPress={() => assign(friend)} style={[styles.assignButton, !!assigningUserId && styles.disabledButton]}>{isAssigning ? <ActivityIndicator size="small" color={colors.surface} /> : <><UserPlus color={colors.surface} size={13} /><Text style={styles.assignText}>Assign</Text></>}</Pressable></View>;
        }) : <EmptyState icon={Users} title="No friends available" description="Accept a friend request first, or choose someone who isn’t already an admin." />}
      </ScrollView>
      {!!error && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
    </View></View>
  </Modal>;
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: "flex-end", backgroundColor: "#13251FD9" },
  sheet: { maxHeight: "75%", minHeight: 300, paddingHorizontal: 18, paddingTop: 17, paddingBottom: 22, borderTopLeftRadius: 18, borderTopRightRadius: 18, backgroundColor: colors.paper },
  header: { flexDirection: "row", alignItems: "center", gap: 9 },
  headerIcon: { width: 32, height: 32, borderRadius: 10, alignItems: "center", justifyContent: "center", backgroundColor: colors.forest },
  headingCopy: { flex: 1, gap: 3 },
  title: { color: colors.ink, fontFamily: "Georgia", fontSize: 20 },
  subtitle: { color: colors.muted, fontSize: 9 },
  closeButton: { width: 32, height: 32, alignItems: "center", justifyContent: "center" },
  helper: { marginTop: 14, marginBottom: 10, color: colors.muted, fontSize: 9, lineHeight: 14 },
  list: { flexGrow: 0 },
  listContent: { paddingBottom: 6 },
  friendRow: { minHeight: 58, borderTopWidth: 1, borderTopColor: colors.line, flexDirection: "row", alignItems: "center", gap: 9 },
  avatar: { width: 34, height: 34, borderRadius: 17, alignItems: "center", justifyContent: "center", backgroundColor: colors.leaf },
  avatarText: { color: colors.surface, fontSize: 9, fontWeight: "800" },
  friendCopy: { flex: 1, gap: 3 },
  friendName: { color: colors.ink, fontSize: 10, fontWeight: "700" },
  friendDetail: { color: colors.muted, fontSize: 8 },
  assignButton: { minWidth: 72, minHeight: 32, paddingHorizontal: 9, borderRadius: 7, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 5, backgroundColor: colors.forest },
  assignText: { color: colors.surface, fontSize: 8, fontWeight: "700" },
  disabledButton: { opacity: 0.6 },
  error: { marginTop: 8, color: "#9B493C", fontSize: 8, lineHeight: 12 },
});