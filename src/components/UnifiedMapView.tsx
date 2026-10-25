import { Linking, Pressable, StyleProp, StyleSheet, Text, View, ViewStyle } from "react-native";
import type { AppCoords } from "../services/location/types";
import { USE_GOOGLE_MAPS } from "../services/location";

type UnifiedMapViewProps = {
  userLocation: AppCoords | null;
  destinationLocation: AppCoords | null;
  routePoints: AppCoords[];
  style?: StyleProp<ViewStyle>;
  selectionMode?: boolean;
  readOnly?: boolean;
  userLocationTitle?: string;
  destinationTitle?: string;
  cameraTarget?: AppCoords | null;
  selectedLocation?: AppCoords | null;
  onLocationSelect?: (location: AppCoords) => void;
};

export function UnifiedMapView({ userLocation, destinationLocation, routePoints, style, selectionMode = false, readOnly = false, selectedLocation, onLocationSelect }: UnifiedMapViewProps) {
  const mapUrl = USE_GOOGLE_MAPS
    ? "https://maps.google.com"
    : "https://www.openstreetmap.org/fixthemap";
  const openMap = () => {
    void Linking.openURL(mapUrl).catch((error: unknown) => console.warn("[map] Could not open map link", error));
  };

  return <View style={[styles.container, selectionMode && styles.selectionContainer, style]}>
    <Text style={styles.title}>Map preview is available in the mobile app</Text>
    <Text style={styles.details}>
      {`Start: ${userLocation ? `${userLocation.lat.toFixed(4)}, ${userLocation.lng.toFixed(4)}` : "not set"}\nDestination: ${destinationLocation ? `${destinationLocation.lat.toFixed(4)}, ${destinationLocation.lng.toFixed(4)}` : "not set"}\nRoute points: ${routePoints.length}`}
    </Text>
    {selectionMode && <View style={styles.webPicker}>
      <Text style={styles.webPickerText}>Map pin selection is available in the mobile app.</Text>
      <Pressable accessibilityRole="button" disabled={!userLocation} onPress={() => userLocation && onLocationSelect?.(userLocation)} style={[styles.webButton, !userLocation && styles.disabled]}>
        <Text style={styles.webButtonText}>{selectedLocation ? "Use selected coordinates" : "Use my current location"}</Text>
      </Pressable>
      {selectedLocation && <Text style={styles.details}>{`${selectedLocation.lat.toFixed(5)}, ${selectedLocation.lng.toFixed(5)}`}</Text>}
    </View>}
    {!readOnly && <Pressable accessibilityRole="link" onPress={openMap}><Text style={styles.link}>Open map</Text></Pressable>}
    {!USE_GOOGLE_MAPS && <Text style={styles.attribution}>© OpenStreetMap contributors · OpenFreeMap</Text>}
  </View>;
}

const styles = StyleSheet.create({
  container: { minHeight: 260, alignItems: "center", justifyContent: "center", gap: 12, padding: 20, borderRadius: 12, backgroundColor: "#E8EDDF" },
  selectionContainer: { flex: 1, borderRadius: 0 },
  title: { color: "#193A32", fontSize: 13, fontWeight: "700", textAlign: "center" },
  details: { color: "#7D8B82", fontSize: 10, lineHeight: 16, textAlign: "center" },
  link: { color: "#214E3D", fontSize: 11, fontWeight: "700" },
  attribution: { color: "#7D8B82", fontSize: 8 },
  webPicker: { alignItems: "center", gap: 8 },
  webPickerText: { color: "#7D8B82", fontSize: 9, textAlign: "center" },
  webButton: { minHeight: 36, alignItems: "center", justifyContent: "center", paddingHorizontal: 12, borderRadius: 7, backgroundColor: "#214E3D" },
  webButtonText: { color: "#FFFFFF", fontSize: 9, fontWeight: "700" },
  disabled: { opacity: 0.5 },
});
