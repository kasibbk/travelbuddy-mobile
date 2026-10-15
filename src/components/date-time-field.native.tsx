import { useState } from "react";
import { DateTimePickerAndroid } from "@react-native-community/datetimepicker";
import DateTimePicker from "@react-native-community/datetimepicker";
import { Modal, Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { colors } from "./theme";

type DateTimeFieldProps = {
  label: string;
  mode: "date" | "time";
  value: Date | null;
  onChange: (value: Date) => void;
};

export function DateTimeField({ label, mode, value, onChange }: DateTimeFieldProps) {
  const [visible, setVisible] = useState(false);
  const [selectedValue, setSelectedValue] = useState(value ?? new Date());
  const pickerValue = value ?? new Date();

  function openPicker() {
    if (Platform.OS === "android") {
      DateTimePickerAndroid.open({
        value: pickerValue,
        mode,
        is24Hour: false,
        onValueChange: (_event, selectedDate) => onChange(selectedDate),
      });
      return;
    }
    setSelectedValue(pickerValue);
    setVisible(true);
  }

  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <Pressable accessibilityRole="button" onPress={openPicker} style={styles.input}>
        <Text style={[styles.value, !value && styles.placeholder]}>
          {value
            ? mode === "date"
              ? value.toLocaleDateString()
              : value.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })
            : mode === "date" ? "Select date" : "Select time"}
        </Text>
      </Pressable>
      {Platform.OS === "ios" && <Modal visible={visible} transparent animationType="slide" onRequestClose={() => setVisible(false)}>
        <View style={styles.backdrop}>
          <View style={styles.pickerSheet}>
            <View style={styles.pickerHeader}>
              <Pressable accessibilityRole="button" onPress={() => setVisible(false)}><Text style={styles.cancel}>Cancel</Text></Pressable>
              <Text style={styles.pickerTitle}>{label}</Text>
              <Pressable accessibilityRole="button" onPress={() => { onChange(selectedValue); setVisible(false); }}><Text style={styles.done}>Done</Text></Pressable>
            </View>
            <DateTimePicker
              value={pickerValue}
              mode={mode}
              display="spinner"
              onValueChange={(_event, selectedDate) => setSelectedValue(selectedDate)}
            />
          </View>
        </View>
      </Modal>}
    </View>
  );
}

const styles = StyleSheet.create({
  field: { flex: 1, gap: 6 },
  label: { color: "#66796D", fontSize: 9, fontWeight: "700" },
  input: { minHeight: 43, justifyContent: "center", paddingHorizontal: 12, borderWidth: 1, borderColor: colors.line, borderRadius: 8, backgroundColor: colors.surface },
  value: { color: colors.ink, fontSize: 12 },
  placeholder: { color: colors.subtle },
  backdrop: { flex: 1, justifyContent: "flex-end", backgroundColor: "#13251F99" },
  pickerSheet: { paddingBottom: 24, borderTopLeftRadius: 18, borderTopRightRadius: 18, backgroundColor: colors.surface },
  pickerHeader: { minHeight: 48, paddingHorizontal: 18, borderBottomWidth: 1, borderBottomColor: colors.line, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  pickerTitle: { color: colors.ink, fontSize: 12, fontWeight: "700" },
  cancel: { color: colors.muted, fontSize: 11 },
  done: { color: colors.forest, fontSize: 11, fontWeight: "700" },
});
