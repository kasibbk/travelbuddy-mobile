import { useEffect, useRef, useState } from "react";
import { useLocalSearchParams, useRouter } from "expo-router";
import { ArrowLeft, Check, LocateFixed, MapPin } from "lucide-react-native";
import * as Location from "expo-location";
import { ActivityIndicator, Keyboard, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { UnifiedMapView } from "../components/UnifiedMapView";
import { colors } from "../components/theme";
import { LocationService } from "../services/location";
import { cancelRideLocationSelection, completeRideLocationSelection } from "../services/location/picker";
import type { AppCoords, LocationSearchResult } from "../services/location/types";

export default function LocationPickerScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { field } = useLocalSearchParams<{ field?: string }>();
  const [userLocation, setUserLocation] = useState<AppCoords | null>(null);
  const [selectedLocation, setSelectedLocation] = useState<AppCoords | null>(null);
  const [selectedLabel, setSelectedLabel] = useState("");
  const [cameraTarget, setCameraTarget] = useState<AppCoords | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<LocationSearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchMessage, setSearchMessage] = useState("");
  const searchRequest = useRef(0);
  const pauseSearch = useRef(false);
  const [loadingLocation, setLoadingLocation] = useState(true);
  const [resolving, setResolving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    async function locateUser() {
      try {
        const permission = await Location.requestForegroundPermissionsAsync();
        if (!permission.granted) throw new Error("Allow location access to center the map near you. You can still choose a pin manually.");
        const position = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
        if (active) {
          const current = { lat: position.coords.latitude, lng: position.coords.longitude };
          setUserLocation(current);
          setCameraTarget(current);
        }
      } catch (cause) {
        if (active) setError(cause instanceof Error ? cause.message : "Could not get your location.");
      } finally {
        if (active) setLoadingLocation(false);
      }
    }
    void locateUser();
    return () => {
      active = false;
      cancelRideLocationSelection();
    };
  }, []);

  useEffect(() => {
    const requestId = ++searchRequest.current;
    const query = searchQuery.trim();
    if (pauseSearch.current || query.length < 3) {
      setSearchResults([]);
      setSearching(false);
      return;
    }
    const timeout = setTimeout(() => {
      setSearching(true);
      setSearchMessage("");
      setError("");
      void LocationService.searchLocations(query).then((results) => {
        if (requestId === searchRequest.current) {
          setSearchResults(results);
          setSearchMessage(results.length ? "" : "No matching locations found.");
        }
      }).catch((cause: unknown) => {
        if (requestId === searchRequest.current) {
          setSearchResults([]);
          setSearchMessage("");
          setError(cause instanceof Error ? cause.message : "Could not search for this location.");
        }
      }).finally(() => {
        if (requestId === searchRequest.current) setSearching(false);
      });
    }, 500);
    return () => clearTimeout(timeout);
  }, [searchQuery]);

  async function goToCurrentLocation() {
    if (loadingLocation) return;
    setLoadingLocation(true);
    setError("");
    try {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (!permission.granted) throw new Error("Allow location access to find your current location.");
      const position = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      const current = { lat: position.coords.latitude, lng: position.coords.longitude };
      setUserLocation(current);
      setCameraTarget(current);
      setSelectedLocation(current);
      setSelectedLabel("");
      searchRequest.current += 1;
      pauseSearch.current = true;
      setSearching(false);
      setSearchResults([]);
      setSearchMessage("");
      setError("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not get your current location.");
    } finally {
      setLoadingLocation(false);
    }
  }

  function chooseSearchResult(result: LocationSearchResult) {
    setSelectedLocation(result.coords);
    setSelectedLabel(result.label);
    setCameraTarget(result.coords);
    searchRequest.current += 1;
    pauseSearch.current = true;
    setSearchQuery(result.label);
    setSearchResults([]);
    setSearchMessage("");
    setError("");
    Keyboard.dismiss();
  }

  function selectMapLocation(location: AppCoords) {
    setSelectedLocation(location);
    setSelectedLabel("");
    searchRequest.current += 1;
    pauseSearch.current = true;
    setSearching(false);
    setSearchResults([]);
    setSearchMessage("");
    setError("");
  }

  async function confirmSelection() {
    if (!selectedLocation || resolving) return;
    setResolving(true);
    setError("");
    try {
      const resolvedLabel = selectedLabel || await LocationService.reverseGeocode(selectedLocation)
        || `${selectedLocation.lat.toFixed(5)}, ${selectedLocation.lng.toFixed(5)}`;
      const label = resolvedLabel.trim().slice(0, 160);
      if (label.length < 2) throw new Error("Could not resolve this pin to a usable location name.");
      completeRideLocationSelection(label, selectedLocation);
      router.back();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not resolve this pin to a location.");
    } finally {
      setResolving(false);
    }
  }

  function cancel() {
    cancelRideLocationSelection();
    router.back();
  }

  const fieldLabel = field === "destination" ? "destination" : "starting point";

  return <View style={[styles.screen, { paddingBottom: insets.bottom }]}>
    <View style={styles.header}>
      <Pressable accessibilityRole="button" accessibilityLabel="Back" onPress={cancel} style={styles.backButton}><ArrowLeft color={colors.ink} size={19} /></Pressable>
      <View style={styles.heading}><Text style={styles.eyebrow}>RIDE ROUTE</Text><Text style={styles.title}>Choose {fieldLabel}</Text></View>
      <MapPin color={colors.leaf} size={19} />
    </View>
    <View style={styles.searchSection}>
      <View style={styles.searchRow}>
        <TextInput
          value={searchQuery}
          onChangeText={(value) => { searchRequest.current += 1; pauseSearch.current = false; setSearching(false); setSearchQuery(value); setSearchResults([]); setSearchMessage(""); setError(""); }}
          returnKeyType="search"
          placeholder="Type a city, address, or place"
          placeholderTextColor={colors.subtle}
          style={styles.searchInput}
        />
        {searching && <ActivityIndicator size="small" color={colors.forest} />}
      </View>
      {searchResults.length > 0 && <View style={styles.results}>
        {searchResults.map((result, index) => <Pressable key={`${result.coords.lat}:${result.coords.lng}:${index}`} accessibilityRole="button" onPress={() => chooseSearchResult(result)} style={styles.resultRow}>
          <MapPin color={colors.leaf} size={14} />
          <Text numberOfLines={2} style={styles.resultText}>{result.label}</Text>
        </Pressable>)}
      </View>}
      {!!searchMessage && <Text style={styles.searchMessage}>{searchMessage}</Text>}
    </View>
    <View style={styles.instruction}>
      <Text style={styles.instructionText}>Tap the map to place a pin, then confirm your location.</Text>
      <Pressable accessibilityRole="button" accessibilityLabel="Go to current location" disabled={loadingLocation} onPress={() => void goToCurrentLocation()} style={styles.currentLocationButton}>
        {loadingLocation ? <ActivityIndicator size="small" color={colors.forest} /> : <LocateFixed color={colors.forest} size={15} />}
        <Text style={styles.currentLocationText}>Current location</Text>
      </Pressable>
    </View>
    <UnifiedMapView
      userLocation={userLocation}
      destinationLocation={selectedLocation}
      routePoints={[]}
      selectionMode
      cameraTarget={cameraTarget}
      selectedLocation={selectedLocation}
      onLocationSelect={selectMapLocation}
      style={styles.map}
    />
    <View style={styles.footer}>
      {loadingLocation && <View style={styles.loading}><ActivityIndicator size="small" color={colors.leaf} /><Text style={styles.helper}>Finding your location…</Text></View>}
      {selectedLocation && <Text style={styles.selected}>{`${selectedLocation.lat.toFixed(5)}, ${selectedLocation.lng.toFixed(5)}`}</Text>}
      {!!error && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
      <Pressable accessibilityRole="button" accessibilityState={{ disabled: !selectedLocation || resolving }} disabled={!selectedLocation || resolving} onPress={() => void confirmSelection()} style={[styles.confirmButton, (!selectedLocation || resolving) && styles.disabled]}>
        {resolving ? <ActivityIndicator color={colors.surface} /> : <><Check color={colors.surface} size={16} /><Text style={styles.confirmText}>Use this location</Text></>}
      </Pressable>
    </View>
  </View>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.paper },
  header: { minHeight: 60, flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 16, borderBottomWidth: 1, borderBottomColor: colors.line },
  backButton: { width: 36, height: 36, alignItems: "center", justifyContent: "center", borderRadius: 18, backgroundColor: "#EBEEE7" },
  heading: { flex: 1 },
  eyebrow: { color: colors.leaf, fontSize: 8, fontWeight: "800", letterSpacing: 1 },
  title: { marginTop: 3, color: colors.ink, fontFamily: "Georgia", fontSize: 21 },
  instruction: { minHeight: 44, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8, paddingHorizontal: 17, paddingVertical: 7 },
  instructionText: { flex: 1, color: colors.muted, fontSize: 9 },
  searchSection: { zIndex: 2, paddingHorizontal: 14, paddingVertical: 9 },
  searchRow: { minHeight: 42, flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 10, borderWidth: 1, borderColor: colors.line, borderRadius: 9, backgroundColor: colors.surface },
  searchInput: { flex: 1, minWidth: 0, color: colors.ink, fontSize: 10 },
  results: { marginTop: 4, overflow: "hidden", borderWidth: 1, borderColor: colors.line, borderRadius: 9, backgroundColor: colors.surface },
  resultRow: { minHeight: 42, flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 10, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: colors.line },
  resultText: { flex: 1, color: colors.ink, fontSize: 9, lineHeight: 13 },
  searchMessage: { marginTop: 5, color: colors.muted, fontSize: 8 },
  currentLocationButton: { minHeight: 32, flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 8, borderRadius: 7, backgroundColor: colors.paleGreen },
  currentLocationText: { color: colors.forest, fontSize: 8, fontWeight: "700" },
  map: { flex: 1, minHeight: 260, marginHorizontal: 12 },
  footer: { gap: 9, paddingHorizontal: 16, paddingTop: 12, paddingBottom: 12 },
  loading: { flexDirection: "row", alignItems: "center", gap: 7 },
  helper: { color: colors.muted, fontSize: 9 },
  selected: { color: colors.muted, fontSize: 9 },
  error: { color: "#9B493C", fontSize: 9, lineHeight: 14 },
  confirmButton: { minHeight: 45, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, borderRadius: 9, backgroundColor: colors.forest },
  confirmText: { color: colors.surface, fontSize: 11, fontWeight: "700" },
  disabled: { opacity: 0.55 },
});
