import { createElement } from "react";
import { StyleSheet, Text, View } from "react-native";
import { colors } from "./theme";

type DateTimeFieldProps = {
  label: string;
  mode: "date" | "time";
  value: Date | null;
  onChange: (value: Date) => void;
};

export function DateTimeField({ label, mode, value, onChange }: DateTimeFieldProps) {
  const inputValue = value
    ? mode === "date"
      ? `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`
      : `${String(value.getHours()).padStart(2, "0")}:${String(value.getMinutes()).padStart(2, "0")}`
    : "";

  function handleChange(event: { currentTarget: { value: string } }) {
    const selected = event.currentTarget.value;
    if (!selected) return;
    if (mode === "date") {
      const [year, month, day] = selected.split("-").map(Number);
      const current = value ?? new Date();
      onChange(new Date(year, month - 1, day, current.getHours(), current.getMinutes()));
    } else {
      const [hours, minutes] = selected.split(":").map(Number);
      const current = value ?? new Date();
      onChange(new Date(current.getFullYear(), current.getMonth(), current.getDate(), hours, minutes));
    }
  }

  return <View style={styles.field}>
    <Text style={styles.label}>{label}</Text>
    {createElement("input", {
      type: mode,
      value: inputValue,
      onChange: handleChange,
      style: {
        boxSizing: "border-box",
        width: "100%",
        minHeight: 43,
        padding: "0 12px",
        border: `1px solid ${colors.line}`,
        borderRadius: 8,
        backgroundColor: colors.surface,
        color: colors.ink,
        fontSize: 12,
      },
    })}
  </View>;
}

const styles = StyleSheet.create({
  field: { flex: 1, gap: 6 },
  label: { color: "#66796D", fontSize: 9, fontWeight: "700" },
});
