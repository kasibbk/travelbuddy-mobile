import { Image, StyleSheet, Text, View } from "react-native";

type AvatarProps = {
  initials: string;
  imageUrl?: string | null;
  color?: string;
  size?: number;
};

export function Avatar({ initials, imageUrl, color = "#B98264", size = 42 }: AvatarProps) {
  return (
    <View style={[styles.avatar, { width: size, height: size, borderRadius: size / 2, backgroundColor: color }]}>
      {imageUrl
        ? <Image accessibilityLabel="Profile picture" source={{ uri: imageUrl }} style={[styles.image, { borderRadius: size / 2 }]} />
        : <Text style={[styles.initials, { fontSize: Math.max(10, size * 0.27) }]}>{initials}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  avatar: { overflow: "hidden", alignItems: "center", justifyContent: "center", borderWidth: 2, borderColor: "#FFFFFF" },
  image: { width: "100%", height: "100%" },
  initials: { color: "#FFFFFF", fontWeight: "800", letterSpacing: 0 },
});