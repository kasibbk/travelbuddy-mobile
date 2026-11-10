import { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, Keyboard, Pressable, StyleSheet, Switch, Text, TextInput, View } from "react-native";
import * as ImagePicker from "expo-image-picker";
import { useFocusEffect, useRouter } from "expo-router";
import { ArrowLeft, Bike, Camera, ChevronRight, MapPin, ShieldCheck, UserRound } from "lucide-react-native";
import { Avatar } from "../../components/avatar";
import { EmptyState } from "../../components/empty-state";
import { PageShell } from "../../components/page-shell";
import { ImagePreviewModal } from "../../components/image-preview-modal";
import { colors } from "../../components/theme";
import { useAuth } from "../../components/auth-provider";
import { getImagePublicUrl, loadProfile, ProfileData, updateProfile, updateProfileDiscoverable, uploadProfilePicture } from "../../lib/app-data";
import { LocationService } from "../../services/location";
import { ensureLiveLocationTracking, reconcileLiveLocationTracking } from "../../services/location/live-tracking";
import type { LocationSearchResult } from "../../services/location/types";

export default function ProfileScreen() {
  const router = useRouter();
  const { ready, userId, userEmail } = useAuth();
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [displayName, setDisplayName] = useState("");
  const [homeCity, setHomeCity] = useState("");
  const [searchingHomeLocation, setSearchingHomeLocation] = useState(false);
  const [homeLocationResults, setHomeLocationResults] = useState<LocationSearchResult[]>([]);
  const [homeLocationSearchError, setHomeLocationSearchError] = useState("");
  const [searchHomeLocationEnabled, setSearchHomeLocationEnabled] = useState(false);
  const [bio, setBio] = useState("");
  const [ridingPace, setRidingPace] = useState("social");
  const [discoverable, setDiscoverable] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [pictureBusy, setPictureBusy] = useState(false);
  const [picturePreviewOpen, setPicturePreviewOpen] = useState(false);
  const [discoverabilityBusy, setDiscoverabilityBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [focusedFieldY, setFocusedFieldY] = useState<number | null>(null);
  const profileCardY = useRef(0);
  const displayNameY = useRef(0);
  const homeCityY = useRef(0);
  const bioY = useRef(0);
  const homeLocationSearchRequest = useRef(0);

  useEffect(() => {
    const requestId = ++homeLocationSearchRequest.current;
    const query = homeCity.trim();
    if (!searchHomeLocationEnabled || query.length < 3) return;
    const timeout = setTimeout(() => {
      setSearchingHomeLocation(true);
      setHomeLocationSearchError("");
      void LocationService.searchLocations(query).then((results) => {
        if (requestId !== homeLocationSearchRequest.current) return;
        setHomeLocationResults(results);
        if (!results.length) setHomeLocationSearchError("No matching locations found.");
      }).catch((cause: unknown) => {
        if (requestId === homeLocationSearchRequest.current) {
          setHomeLocationSearchError(cause instanceof Error ? cause.message : "Could not search for this location.");
        }
      }).finally(() => {
        if (requestId === homeLocationSearchRequest.current) setSearchingHomeLocation(false);
      });
    }, 500);
    return () => clearTimeout(timeout);
  }, [homeCity, searchHomeLocationEnabled]);

  function selectHomeLocation(result: LocationSearchResult) {
    setHomeCity(result.label.slice(0, 100));
    setSearchHomeLocationEnabled(false);
    setSearchingHomeLocation(false);
    homeLocationSearchRequest.current += 1;
    setHomeLocationResults([]);
    setHomeLocationSearchError("");
    Keyboard.dismiss();
  }

  async function changeDiscoverable(value: boolean) {
    if (!userId || saving || discoverabilityBusy) return;
    setDiscoverabilityBusy(true);
    setError("");
    setNotice("");
    try {
      const updated = await updateProfileDiscoverable(userId, value);
      setProfile(updated);
      setDiscoverable(updated.discoverable);
      if (value) {
        try {
          await ensureLiveLocationTracking(userId);
        } catch (cause) {
          const reverted = await updateProfileDiscoverable(userId, false);
          setProfile(reverted);
          setDiscoverable(false);
          throw cause;
        }
      } else {
        await reconcileLiveLocationTracking(userId);
      }
      setNotice(updated.discoverable ? "Nearby discovery is on." : "Nearby discovery is off.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not update nearby discovery.");
    } finally {
      setDiscoverabilityBusy(false);
    }
  }

  useFocusEffect(useCallback(() => {
    if (!ready) return;
    if (!userId) { setProfile(null); setLoading(false); return; }
    let active = true;
    setLoading(true);
    setError("");
    loadProfile(userId)
      .then((row) => {
        if (!active) return;
        setProfile(row);
        if (row) {
          setDisplayName(row.displayName);
          setHomeCity(row.homeCity ?? "");
          setBio(row.bio);
          setRidingPace(row.ridingPace);
          setDiscoverable(row.discoverable);
        }
      })
      .catch((cause: unknown) => { if (active) setError(cause instanceof Error ? cause.message : "Could not load your profile."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [ready, userId]));

  async function saveChanges() {
    if (!profile || !userId || saving) return;
    if (displayName.trim().length < 2 || displayName.trim().length > 60) { setError("Your name must be between 2 and 60 characters."); return; }
    if (bio.trim().length > 500) { setError("Your bio must be 500 characters or fewer."); return; }
    setSaving(true);
    setError("");
    setNotice("");
    try {
      const updated = await updateProfile({ id: userId, displayName: displayName.trim(), homeCity: homeCity.trim() || null, bio: bio.trim(), ridingPace, discoverable });
      setProfile(updated);
      setNotice("Profile saved.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not save your profile.");
    } finally {
      setSaving(false);
    }
  }

  async function changeProfilePicture() {
    if (!userId || pictureBusy) return;
    setPictureBusy(true);
    setError("");
    setNotice("");
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.8,
        preferredAssetRepresentationMode: ImagePicker.UIImagePickerPreferredAssetRepresentationMode.Compatible,
      });
      if (result.canceled) return;
      const asset = result.assets[0];
      if (!asset) throw new Error("No image was selected.");
      const updated = await uploadProfilePicture(userId, { uri: asset.uri, mimeType: asset.mimeType });
      setProfile(updated);
      setNotice("Profile picture updated.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not upload your profile picture.");
    } finally {
      setPictureBusy(false);
    }
  }

  async function refreshProfile() {
    if (!userId || refreshing) return;
    setRefreshing(true);
    setError("");
    try {
      const row = await loadProfile(userId, true);
      setProfile(row);
      if (row) {
        setDisplayName(row.displayName);
        setHomeCity(row.homeCity ?? "");
        setBio(row.bio);
        setRidingPace(row.ridingPace);
        setDiscoverable(row.discoverable);
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not refresh your profile.");
    } finally {
      setRefreshing(false);
    }
  }

  const initials = profile?.displayName.split(/\s+/).map((part) => part[0]).join("").slice(0, 2).toUpperCase() ?? "";
  const profilePictureUrl = getImagePublicUrl("profile-images", profile?.avatarPath ?? null);
  return <PageShell refreshing={refreshing} onRefresh={refreshProfile} focusedFieldY={focusedFieldY}>
    <View style={styles.topbar}><Pressable accessibilityLabel="Back" onPress={() => router.back()} style={styles.back}><ArrowLeft color={colors.ink} size={19} /></Pressable><View style={styles.brandMark}><Bike color={colors.lime} size={17} /></View><Text style={styles.topTitle}>Your profile</Text><View style={{ flex: 1 }} /></View>
    <View style={styles.heading}><Text style={styles.eyebrow}>YOUR CORNER OF THE MAP</Text><Text style={styles.title}>Your profile</Text><Text style={styles.subtitle}>Manage your details and nearby discovery.</Text></View>
    {loading ? <ActivityIndicator color={colors.leaf} style={styles.loader} /> : error && !profile ? <EmptyState icon={UserRound} title="Profile couldn’t load" description={error} /> : profile ? <>
      <View onLayout={(event) => { profileCardY.current = event.nativeEvent.layout.y; }} style={styles.profileCard}>
        <View style={styles.identity}>{profilePictureUrl ? <Pressable accessibilityRole="button" accessibilityLabel="View profile picture" onPress={() => setPicturePreviewOpen(true)}><Avatar initials={initials || "R"} imageUrl={profilePictureUrl} size={50} /></Pressable> : <Avatar initials={initials || "R"} size={50} />}<View style={styles.identityText}><Text style={styles.name}>{profile.displayName}</Text><Text style={styles.member}>{userEmail ?? "Signed-in rider"}</Text></View><Pressable accessibilityRole="button" accessibilityLabel="Change profile picture" disabled={pictureBusy} onPress={() => void changeProfilePicture()} style={styles.pictureButton}>{pictureBusy ? <ActivityIndicator size="small" color={colors.forest} /> : <Camera color={colors.forest} size={16} />}</Pressable></View>
        <Text style={styles.label}>YOUR NAME</Text><View onLayout={(event) => { displayNameY.current = event.nativeEvent.layout.y; }}><TextInput value={displayName} onFocus={() => setFocusedFieldY(profileCardY.current + displayNameY.current)} onChangeText={setDisplayName} autoComplete="name" maxLength={60} style={styles.input} /></View>
        <Text style={styles.label}>HOME LOCATION</Text><View onLayout={(event) => { homeCityY.current = event.nativeEvent.layout.y; }} style={styles.cityField}><MapPin color={colors.leaf} size={14} /><TextInput value={homeCity} onFocus={() => { setFocusedFieldY(profileCardY.current + homeCityY.current); setSearchHomeLocationEnabled(true); }} onChangeText={(value) => { homeLocationSearchRequest.current += 1; setSearchingHomeLocation(false); setHomeCity(value); setSearchHomeLocationEnabled(true); setHomeLocationResults([]); setHomeLocationSearchError(""); }} returnKeyType="search" placeholder="Start typing a city or location" placeholderTextColor={colors.subtle} maxLength={100} style={styles.cityInput} />{searchingHomeLocation && <ActivityIndicator size="small" color={colors.forest} />}</View>
        {homeLocationResults.length > 0 && <View style={styles.locationResults}>{homeLocationResults.map((result, index) => <Pressable key={`${result.coords.lat}:${result.coords.lng}:${index}`} accessibilityRole="button" onPress={() => selectHomeLocation(result)} style={styles.locationResult}><MapPin color={colors.leaf} size={13} /><Text numberOfLines={2} style={styles.locationResultText}>{result.label}</Text></Pressable>)}</View>}
        {!!homeLocationSearchError && <Text accessibilityRole="alert" style={styles.locationSearchError}>{homeLocationSearchError}</Text>}
        <Text style={styles.label}>ABOUT</Text><View onLayout={(event) => { bioY.current = event.nativeEvent.layout.y; }}><TextInput value={bio} onFocus={() => setFocusedFieldY(profileCardY.current + bioY.current)} onChangeText={setBio} placeholder="A little about your rides" placeholderTextColor={colors.subtle} multiline maxLength={500} style={[styles.input, styles.bioInput]} /></View>
        <Text style={styles.label}>RIDING PACE</Text><View style={styles.paceChoices}>{(["easy", "social", "steady", "fast"] as const).map((pace) => <Pressable key={pace} accessibilityRole="radio" accessibilityState={{ checked: ridingPace === pace }} onPress={() => setRidingPace(pace)} style={[styles.paceChoice, ridingPace === pace && styles.paceChoiceActive]}><Text style={[styles.paceText, ridingPace === pace && styles.paceTextActive]}>{pace[0].toUpperCase() + pace.slice(1)}</Text></Pressable>)}</View>
        {!!error && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
        {!!notice && <Text accessibilityRole="alert" style={styles.notice}>{notice}</Text>}
        <Pressable accessibilityRole="button" accessibilityState={{ disabled: saving || discoverabilityBusy }} disabled={saving || discoverabilityBusy} onPress={saveChanges} style={[styles.saveButton, (saving || discoverabilityBusy) && styles.buttonBusy]}>{saving ? <ActivityIndicator color={colors.surface} /> : <Text style={styles.saveText}>Save profile</Text>}</Pressable>
      </View>
      <View style={styles.privacyCard}>
        <View style={styles.privacyHeading}><View><Text style={styles.cardTitle}>Nearby discovery</Text><Text style={styles.cardSubtitle}>You control whether nearby riders can find you.</Text></View><ShieldCheck color={colors.leaf} size={19} /></View>
        <View style={styles.settingRow}><View style={styles.settingCopy}><Text style={styles.settingTitle}>Show me to nearby riders</Text><Text style={styles.settingDetail}>{discoverable ? "Your approximate distance uses live location; exact coordinates are not shown in Nearby." : "Turn this on to appear in Nearby. Live friend sharing remains a separate preference."}</Text></View>{discoverabilityBusy ? <ActivityIndicator size="small" color={colors.leaf} /> : <Switch value={discoverable} disabled={saving} onValueChange={(value) => void changeDiscoverable(value)} trackColor={{ false: "#D6DDD3", true: colors.leaf }} thumbColor={colors.surface} />}</View>
        {/* <Text style={styles.locationPrivacyNote}>Location updates run while either preference is on and stop when both are off.</Text> */}
      </View>
    </> : <EmptyState icon={UserRound} title="Profile not found" description="This account has no profile record yet. Contact support to restore its profile." />}
    <Pressable style={styles.accountLink} onPress={() => router.push("/account/settings")}><View><Text style={styles.accountTitle}>Account &amp; sign-in</Text><Text style={styles.accountSubtitle}>{userEmail ?? "Supabase account"}</Text></View><ChevronRight color={colors.muted} size={18} /></Pressable>
    <ImagePreviewModal imageUrl={profilePictureUrl} visible={picturePreviewOpen} label={profile?.displayName ?? "Profile"} onClose={() => setPicturePreviewOpen(false)} />
  </PageShell>;
}

const styles = StyleSheet.create({
  topbar: { height: 48, paddingHorizontal: 17, flexDirection: "row", alignItems: "center", gap: 9 }, back: { width: 26, height: 36, alignItems: "flex-start", justifyContent: "center" }, brandMark: { width: 27, height: 27, borderRadius: 9, alignItems: "center", justifyContent: "center", backgroundColor: colors.forest }, topTitle: { color: colors.ink, fontSize: 12, fontWeight: "800" },
  heading: { paddingHorizontal: 20, paddingTop: 10, paddingBottom: 15 }, eyebrow: { color: colors.muted, fontSize: 8, fontWeight: "800", letterSpacing: 1 }, title: { marginTop: 6, color: colors.ink, fontFamily: "Georgia", fontSize: 29, fontWeight: "500" }, subtitle: { marginTop: 4, color: colors.muted, fontSize: 10 },
  profileCard: { marginHorizontal: 16, padding: 15, borderWidth: 1, borderColor: colors.line, borderRadius: 12, backgroundColor: colors.surface }, identity: { marginBottom: 8, paddingBottom: 13, borderBottomWidth: 1, borderBottomColor: colors.line, flexDirection: "row", alignItems: "center", gap: 11 }, identityText: { flex: 1, gap: 4 }, name: { color: colors.ink, fontFamily: "Georgia", fontSize: 19 }, member: { color: colors.muted, fontSize: 8 }, pictureButton: { width: 34, height: 34, borderRadius: 9, alignItems: "center", justifyContent: "center", backgroundColor: colors.paleGreen },
  label: { marginTop: 10, marginBottom: 5, color: colors.muted, fontSize: 7, fontWeight: "800", letterSpacing: 0.6 }, input: { minHeight: 38, paddingHorizontal: 10, borderWidth: 1, borderColor: colors.line, borderRadius: 7, backgroundColor: "#FDFEFB", color: colors.ink, fontSize: 10 }, bioInput: { minHeight: 67, paddingTop: 9, textAlignVertical: "top" }, cityField: { minHeight: 38, paddingHorizontal: 10, borderWidth: 1, borderColor: colors.line, borderRadius: 7, backgroundColor: "#FDFEFB", flexDirection: "row", alignItems: "center", gap: 7 }, cityInput: { flex: 1, color: colors.ink, fontSize: 10 }, citySearchButton: { width: 30, height: 30, alignItems: "center", justifyContent: "center", borderRadius: 7, backgroundColor: colors.paleGreen }, locationResults: { marginTop: 4, overflow: "hidden", borderWidth: 1, borderColor: colors.line, borderRadius: 8, backgroundColor: "#FDFEFB" }, locationResult: { minHeight: 38, flexDirection: "row", alignItems: "center", gap: 7, paddingHorizontal: 9, paddingVertical: 7, borderBottomWidth: 1, borderBottomColor: colors.line }, locationResultText: { flex: 1, color: colors.ink, fontSize: 8, lineHeight: 12 }, locationSearchError: { marginTop: 5, color: "#9B493C", fontSize: 8 }, paceChoices: { flexDirection: "row", gap: 5 }, paceChoice: { flex: 1, minHeight: 31, borderWidth: 1, borderColor: colors.line, borderRadius: 6, alignItems: "center", justifyContent: "center" }, paceChoiceActive: { borderColor: colors.forest, backgroundColor: colors.forest }, paceText: { color: colors.muted, fontSize: 7 }, paceTextActive: { color: colors.surface, fontWeight: "700" },
  saveButton: { minHeight: 39, marginTop: 12, borderRadius: 8, alignItems: "center", justifyContent: "center", backgroundColor: colors.forest }, saveText: { color: colors.surface, fontSize: 10, fontWeight: "700" }, error: { marginTop: 8, color: "#9B493C", fontSize: 8, lineHeight: 12 }, notice: { marginTop: 8, color: colors.leaf, fontSize: 8, lineHeight: 12 }, buttonBusy: { opacity: 0.65 },
  loader: { marginVertical: 28 },
  locationPrivacyNote: { marginTop: 4, color: colors.muted, fontSize: 7, lineHeight: 11 },
  privacyCard: { marginHorizontal: 16, marginTop: 13, padding: 14, borderWidth: 1, borderColor: colors.line, borderRadius: 12, backgroundColor: colors.surface }, privacyHeading: { marginBottom: 9, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 }, cardTitle: { color: colors.ink, fontSize: 12, fontWeight: "700" }, cardSubtitle: { marginTop: 3, color: colors.muted, fontSize: 8, lineHeight: 12 }, settingRow: { minHeight: 55, borderTopWidth: 1, borderTopColor: "#EEF0E9", flexDirection: "row", alignItems: "center", gap: 8 }, settingCopy: { flex: 1, gap: 3 }, settingTitle: { color: colors.ink, fontSize: 9, fontWeight: "700" }, settingDetail: { color: colors.muted, fontSize: 7, lineHeight: 11 },
  accountLink: { minHeight: 59, marginHorizontal: 16, marginTop: 13, paddingHorizontal: 13, borderWidth: 1, borderColor: colors.line, borderRadius: 10, backgroundColor: colors.surface, flexDirection: "row", alignItems: "center", justifyContent: "space-between" }, accountTitle: { color: colors.ink, fontSize: 9, fontWeight: "700" }, accountSubtitle: { marginTop: 4, color: colors.muted, fontSize: 8 },
});