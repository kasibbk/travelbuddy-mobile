import { StyleSheet, Text, View } from "react-native";

type AvatarProps = {
  initials: string;
  color?: string;
  size?: number;
};

export function Avatar({ initials, color = "#B98264", size = 42 }: AvatarProps) {
  return (
    <View style={[styles.avatar, { width: size, height: size, borderRadius: size / 2, backgroundColor: color }]}>
      <Text style={[styles.initials, { fontSize: Math.max(10, size * 0.27) }]}>{initials}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  avatar: { alignItems: "center", justifyContent: "center", borderWidth: 2, borderColor: "#FFFFFF" },
  initials: { color: "#FFFFFF", fontWeight: "800", letterSpacing: 0 },
});