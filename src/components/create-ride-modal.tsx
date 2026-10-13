import { useState } from "react";
import { CalendarDays, Check, MapPin, ShieldCheck, X } from "lucide-react-native";
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { colors } from "./theme";

type CreateRideModalProps = { visible: boolean; onClose: () => void; onCreated: () => void };

export function CreateRideModal({ visible, onClose, onCreated }: CreateRideModalProps) {
  const [title, setTitle] = useState("");
  const [start, setStart] = useState("");
  const [destination, setDestination] = useState("");
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [coAdmin, setCoAdmin] = useState(false);
  const [created, setCreated] = useState(false);

  function createRide() {
    if (!title.trim() || !start.trim() || !destination.trim() || !date.trim() || !time.trim()) return;
    setCreated(true);
  }

  function finish() {
    setCreated(false);
    setTitle("");
    setStart("");
    setDestination("");
    setDate("");
    setTime("");
    onCreated();
    onClose();
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView style={styles.backdrop} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        {created ? <View style={styles.success}><View style={styles.successMark}><Check color={colors.forest} size={22} /></View><Text style={styles.successTitle}>Your ride is on the map.</Text><Text style={styles.successText}>Nearby riders can request a spot. You and your co-admin decide who joins.</Text><Pressable style={styles.primaryButton} onPress={finish}><Text style={styles.primaryText}>Sounds good</Text></Pressable></View> : <View style={styles.sheet}>
          <View style={styles.sheetHandle} />
          <View style={styles.sheetHeader}><View><Text style={styles.eyebrow}>MAKE ROOM FOR ADVENTURE</Text><Text style={styles.heading}>Plan a new ride</Text></View><Pressable accessibilityLabel="Close" style={styles.closeButton} onPress={onClose}><X color={colors.muted} size={19} /></Pressable></View>
          <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} contentContainerStyle={styles.form}>
            <Field label="Ride name" value={title} onChangeText={setTitle} placeholder="Saturday coast loop" />
            <View style={styles.sectionLabel}><MapPin color={colors.leaf} size={14} /><Text style={styles.sectionText}>YOUR ROUTE</Text></View>
            <Field label="Starting point" value={start} onChangeText={setStart} placeholder="Where to meet" />
            <Field label="Destination" value={destination} onChangeText={setDestination} placeholder="Where we're headed" />
            <Field label="Stops along the way · optional" placeholder="Coffee stop or viewpoint" />
            <View style={styles.sectionLabel}><CalendarDays color={colors.leaf} size={14} /><Text style={styles.sectionText}>WHEN & WHO</Text></View>
            <View style={styles.split}><Field style={styles.half} label="Date" value={date} onChangeText={setDate} placeholder="Oct 24, 2026" /><Field style={styles.half} label="Meet-up time" value={time} onChangeText={setTime} placeholder="8:30 AM" /></View>
            <View style={styles.adminBox}><ShieldCheck color={colors.leaf} size={18} /><View style={styles.adminCopy}><Text style={styles.adminTitle}>Ride admin</Text><Text style={styles.adminText}>{coAdmin ? "Jamie + Maya Chen approve requests" : "You approve all join requests"}</Text></View><Pressable onPress={() => setCoAdmin(!coAdmin)} style={styles.coAdminButton}><Text style={styles.coAdminText}>{coAdmin ? "Remove" : "+ Co-admin"}</Text></Pressable></View>
            <Text style={styles.helperText}>Only you and designated ride admins can approve who joins.</Text>
            <Pressable style={styles.primaryButton} onPress={createRide}><Text style={styles.primaryText}>Create ride</Text></Pressable>
          </ScrollView>
        </View>}
      </KeyboardAvoidingView>
    </Modal>
  );
}

function Field({ label, style, ...inputProps }: React.ComponentProps<typeof TextInput> & { label: string }) {
  return <View style={[styles.field, style]}><Text style={styles.label}>{label}</Text><TextInput {...inputProps} style={styles.input} placeholderTextColor={colors.subtle} /></View>;
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: "flex-end", backgroundColor: "#13251FD9" },
  sheet: { maxHeight: "93%", paddingHorizontal: 19, paddingTop: 9, paddingBottom: Platform.OS === "ios" ? 26 : 16, borderTopLeftRadius: 22, borderTopRightRadius: 22, backgroundColor: colors.paper },
  sheetHandle: { width: 37, height: 4, alignSelf: "center", marginBottom: 14, borderRadius: 4, backgroundColor: "#D2D9CE" },
  sheetHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingBottom: 13, borderBottomWidth: 1, borderBottomColor: colors.line },
  eyebrow: { color: colors.muted, fontSize: 8, fontWeight: "800", letterSpacing: 1 },
  heading: { marginTop: 4, color: colors.ink, fontFamily: "Georgia", fontSize: 25, fontWeight: "500" },
  closeButton: { width: 34, height: 34, borderRadius: 17, alignItems: "center", justifyContent: "center", backgroundColor: "#EBEEE7" },
  form: { gap: 12, paddingTop: 15, paddingBottom: 5 },
  sectionLabel: { marginTop: 3, flexDirection: "row", alignItems: "center", gap: 7 },
  sectionText: { color: colors.muted, fontSize: 9, fontWeight: "800", letterSpacing: 0.9 },
  field: { gap: 6 },
  label: { color: "#66796D", fontSize: 9, fontWeight: "700" },
  input: { minHeight: 43, paddingHorizontal: 12, borderWidth: 1, borderColor: colors.line, borderRadius: 8, backgroundColor: colors.surface, color: colors.ink, fontSize: 12 },
  split: { flexDirection: "row", gap: 10 },
  half: { flex: 1 },
  adminBox: { flexDirection: "row", alignItems: "center", gap: 10, padding: 12, borderRadius: 9, backgroundColor: colors.paleGreen },
  adminCopy: { flex: 1, gap: 3 },
  adminTitle: { color: colors.ink, fontSize: 10, fontWeight: "700" },
  adminText: { color: colors.muted, fontSize: 8 },
  coAdminButton: { paddingHorizontal: 9, paddingVertical: 7, borderRadius: 6, backgroundColor: colors.surface },
  coAdminText: { color: colors.forest, fontSize: 8, fontWeight: "700" },
  helperText: { color: colors.muted, fontSize: 9, lineHeight: 14 },
  primaryButton: { minHeight: 45, marginTop: 3, borderRadius: 9, alignItems: "center", justifyContent: "center", backgroundColor: colors.forest },
  primaryText: { color: colors.surface, fontSize: 11, fontWeight: "700" },
  success: { marginHorizontal: 20, marginBottom: 30, padding: 25, alignItems: "center", borderRadius: 18, backgroundColor: colors.paper },
  successMark: { width: 48, height: 48, marginBottom: 13, borderRadius: 24, alignItems: "center", justifyContent: "center", backgroundColor: colors.paleGreen },
  successTitle: { color: colors.ink, fontFamily: "Georgia", fontSize: 23, fontWeight: "500" },
  successText: { marginTop: 8, marginBottom: 18, color: colors.muted, fontSize: 10, lineHeight: 16, textAlign: "center" },
});