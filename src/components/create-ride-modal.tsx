import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Keyboard, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { CalendarDays, MapPin, ShieldCheck, X } from "lucide-react-native";
import { DateTimeField } from "./date-time-field";
import { useAuth } from "./auth-provider";
import { createRide, RideCardData, updateRideDetails } from "../lib/app-data";
import { colors } from "./theme";

type CreateRideModalProps = { visible: boolean; onClose: () => void; onCreated: (ride: RideCardData) => void; ride?: RideCardData; onUpdated?: (ride: RideCardData) => void };

export function CreateRideModal({ visible, onClose, onCreated, ride: rideToEdit, onUpdated }: CreateRideModalProps) {
  const { userId } = useAuth();
  const insets = useSafeAreaInsets();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [start, setStart] = useState("");
  const [destination, setDestination] = useState("");
  const [startsAt, setStartsAt] = useState<Date | null>(null);
  const [capacity, setCapacity] = useState("6");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const formRef = useRef<ScrollView>(null);
  const focusedFieldY = useRef<number | null>(null);
  const keyboardVisible = useRef(false);

  useEffect(() => {
    if (!visible) return;
    const showSubscription = Keyboard.addListener("keyboardDidShow", () => {
      keyboardVisible.current = true;
      if (focusedFieldY.current !== null) {
        formRef.current?.scrollTo({ y: Math.max(0, focusedFieldY.current - 16), animated: true });
      }
    });
    const hideSubscription = Keyboard.addListener("keyboardDidHide", () => {
      keyboardVisible.current = false;
    });
    return () => {
      showSubscription.remove();
      hideSubscription.remove();
    };
  }, [visible]);

  function focusField(y: number) {
    focusedFieldY.current = y;
    if (keyboardVisible.current) formRef.current?.scrollTo({ y: Math.max(0, y - 16), animated: true });
  }

  useEffect(() => {
    if (!visible) return;
    if (rideToEdit) {
      const [startLabel = "", destinationLabel = ""] = rideToEdit.route.split(" → ");
      setTitle(rideToEdit.title);
      setDescription(rideToEdit.description);
      setStart(startLabel);
      setDestination(destinationLabel);
      setStartsAt(new Date(rideToEdit.startsAt));
      setCapacity(String(rideToEdit.capacity));
    } else {
      setTitle("");
      setDescription("");
      setStart("");
      setDestination("");
      setStartsAt(null);
      setCapacity("6");
    }
    setError("");
  }, [visible, rideToEdit]);

  async function submitRide() {
    setError("");
    if (!userId) { setError("Sign in before creating a ride."); return; }
    if (title.trim().length < 3 || title.trim().length > 100) { setError("Ride name must be between 3 and 100 characters."); return; }
    if (start.trim().length < 2 || destination.trim().length < 2) { setError("Add a starting point and destination."); return; }
    if (description.trim().length > 2000) { setError("Description must be 2,000 characters or fewer."); return; }
    const capacityNumber = Number(capacity);
    if (!Number.isInteger(capacityNumber) || capacityNumber < 2 || capacityNumber > 100) { setError("Rider limit must be a whole number from 2 to 100."); return; }

    if (!startsAt || Number.isNaN(startsAt.getTime())) {
      setError("Choose a date and meet-up time.");
      return;
    }
    if (startsAt.getTime() <= Date.now()) { setError("Choose a future date and time."); return; }

    setSubmitting(true);
    try {
      const ride = rideToEdit
        ? await updateRideDetails(rideToEdit.id, userId, {
          title: title.trim(),
          description: description.trim(),
          startLabel: start.trim(),
          destinationLabel: destination.trim(),
          startsAt: startsAt.toISOString(),
          capacity: capacityNumber,
        })
        : await createRide({
          creatorId: userId,
          title: title.trim(),
          description: description.trim(),
          startLabel: start.trim(),
          destinationLabel: destination.trim(),
          startsAt: startsAt.toISOString(),
          capacity: capacityNumber,
        });
      if (rideToEdit) onUpdated?.(ride);
      else onCreated(ride);
      onClose();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : rideToEdit ? "Could not save ride changes." : "Could not create the ride.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={() => { if (!submitting) onClose(); }}>
      <KeyboardAvoidingView style={styles.backdrop} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <View style={[styles.sheet, { paddingBottom: Math.max(Platform.OS === "ios" ? 26 : 16, insets.bottom + 12) }]}>
          <View style={styles.sheetHandle} />
          <View style={styles.sheetHeader}><View><Text style={styles.eyebrow}>{rideToEdit ? "KEEP YOUR RIDERS IN THE LOOP" : "MAKE ROOM FOR ADVENTURE"}</Text><Text style={styles.heading}>{rideToEdit ? "Edit ride details" : "Plan a new ride"}</Text></View><Pressable accessibilityLabel="Close" disabled={submitting} style={styles.closeButton} onPress={onClose}><X color={colors.muted} size={19} /></Pressable></View>
          <ScrollView ref={formRef} keyboardShouldPersistTaps="handled" keyboardDismissMode={Platform.OS === "ios" ? "interactive" : "on-drag"} showsVerticalScrollIndicator={false} contentContainerStyle={styles.form}>
            <Field label="Ride name" value={title} onChangeText={setTitle} onFocus={focusField} placeholder="Name this ride" maxLength={100} />
            <View style={styles.sectionLabel}><MapPin color={colors.leaf} size={14} /><Text style={styles.sectionText}>YOUR ROUTE</Text></View>
            <Field label="Starting point" value={start} onChangeText={setStart} onFocus={focusField} placeholder="Where to meet" maxLength={160} />
            <Field label="Destination" value={destination} onChangeText={setDestination} onFocus={focusField} placeholder="Where you're headed" maxLength={160} />
            <Field label="Description · optional" value={description} onChangeText={setDescription} onFocus={focusField} placeholder="A few details for riders" multiline maxLength={2000} />
            <View style={styles.sectionLabel}><CalendarDays color={colors.leaf} size={14} /><Text style={styles.sectionText}>WHEN & WHO</Text></View>
            <View style={styles.split}><DateTimeField label="Date" mode="date" value={startsAt} onChange={setStartsAt} /><DateTimeField label="Meet-up time" mode="time" value={startsAt} onChange={setStartsAt} /></View>
            <Field label="Rider limit" value={capacity} onChangeText={(value) => setCapacity(value.replace(/\D/g, "").slice(0, 3))} onFocus={focusField} keyboardType="number-pad" maxLength={3} />
            {!rideToEdit && <View style={styles.adminBox}><ShieldCheck color={colors.leaf} size={18} /><View style={styles.adminCopy}><Text style={styles.adminTitle}>Ride admin</Text><Text style={styles.adminText}>You’ll be assigned as the ride owner.</Text></View></View>}
            {!!error && <Text accessibilityRole="alert" style={styles.errorText}>{error}</Text>}
            <Pressable accessibilityRole="button" accessibilityState={{ disabled: submitting }} disabled={submitting} style={[styles.primaryButton, submitting && styles.submittingButton]} onPress={submitRide}>{submitting ? <ActivityIndicator color={colors.surface} /> : <Text style={styles.primaryText}>{rideToEdit ? "Save changes" : "Create ride"}</Text>}</Pressable>
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function Field({ label, style, onFocus, ...inputProps }: Omit<React.ComponentProps<typeof TextInput>, "onFocus"> & { label: string; onFocus?: (y: number) => void }) {
  const fieldY = useRef(0);
  return <View onLayout={(event) => { fieldY.current = event.nativeEvent.layout.y; }} style={[styles.field, style]}><Text style={styles.label}>{label}</Text><TextInput {...inputProps} onFocus={() => onFocus?.(fieldY.current)} style={styles.input} placeholderTextColor={colors.subtle} /></View>;
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
  errorText: { color: "#9B493C", fontSize: 9, lineHeight: 14 },
  primaryButton: { minHeight: 45, marginTop: 3, borderRadius: 9, alignItems: "center", justifyContent: "center", backgroundColor: colors.forest },
  submittingButton: { opacity: 0.7 },
  primaryText: { color: colors.surface, fontSize: 11, fontWeight: "700" },
});