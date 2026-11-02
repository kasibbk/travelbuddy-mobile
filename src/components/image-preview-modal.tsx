import { X } from "lucide-react-native";
import { Image, Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors } from "./theme";

type ImagePreviewModalProps = {
  imageUrl: string | null;
  visible: boolean;
  label: string;
  onClose: () => void;
};

export function ImagePreviewModal({ imageUrl, visible, label, onClose }: ImagePreviewModalProps) {
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible && !!imageUrl} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={[styles.header, { top: insets.top + 12 }]}>
          <Text numberOfLines={1} style={styles.label}>{label}</Text>
          <Pressable accessibilityRole="button" accessibilityLabel="Close image preview" onPress={onClose} style={styles.closeButton}>
            <X color={colors.surface} size={21} />
          </Pressable>
        </View>
        {imageUrl && <Image accessibilityLabel={label} source={{ uri: imageUrl }} resizeMode="contain" style={styles.image} />}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, alignItems: "center", justifyContent: "center", padding: 18, backgroundColor: "#101713F2" },
  header: { position: "absolute", top: 24, left: 20, right: 20, zIndex: 1, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 },
  label: { flex: 1, color: colors.surface, fontSize: 13, fontWeight: "700" },
  closeButton: { width: 40, height: 40, alignItems: "center", justifyContent: "center", borderRadius: 20, backgroundColor: "#FFFFFF24" },
  image: { width: "100%", height: "85%" },
});
