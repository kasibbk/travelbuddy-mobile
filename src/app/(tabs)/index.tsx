import { useState } from "react";
import { ArrowRight, CalendarDays, MapPin, Navigation, Users } from "lucide-react-native";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { AppHeader } from "../../components/app-header";
import { CreateRideModal } from "../../components/create-ride-modal";
import { PageShell } from "../../components/page-shell";
import { RideCard } from "../../components/ride-card";
import { RouteMap } from "../../components/route-map";
import { colors } from "../../components/theme";
import { nearbyRiders, rides } from "../../lib/demo-data";

export default function DiscoverScreen() {
  const [createVisible, setCreateVisible] = useState(false);
  const [requested, setRequested] = useState<string[]>([]);
  const [inviteSent, setInviteSent] = useState<string[]>([]);
  const [rideFilter, setRideFilter] = useState("For you");
  const visibleRides = rides.filter((ride) => rideFilter === "Under 40 mi" ? Number.parseInt(ride.distance) < 40 : rideFilter === "Easy pace" ? ride.id !== "redwoods" : true).slice(0, 2);

  function requestRide(id: string) {
    setRequested((current) => current.includes(id) ? current : [...current, id]);
  }

  return <PageShell>
    <AppHeader eyebrow="MONDAY, OCTOBER 12" title="Good morning, Jamie." subtitle="A little fresh air looks good on your calendar." onCreate={() => setCreateVisible(true)} />
    <View style={styles.feature}>
      <View style={styles.featureTop}><View style={styles.liveLabel}><View style={styles.liveDot} /><Text style={styles.featureEyebrow}>YOUR NEXT GOOD DAY OUT</Text></View><Text style={styles.featureIndex}>01 / 08</Text></View>
      <Text style={styles.featureTitle}>The coast is{ "\n" }calling.</Text>
      <Text style={styles.featureDescription}>Take the long way with a good crew, then be back for lunch.</Text>
      <RouteMap />
      <View style={styles.featureMeta}><View style={styles.metaItem}><CalendarDays color={colors.lime} size={14} /><Text style={styles.metaText}>SAT, OCT 17 · 8:30 AM</Text></View><View style={styles.metaItem}><MapPin color={colors.lime} size={14} /><Text style={styles.metaText}>SAN FRANCISCO → HALF MOON BAY</Text></View></View>
      <Pressable style={styles.featureButton} onPress={() => requestRide("coastline")}><Text style={styles.featureButtonText}>{requested.includes("coastline") ? "Request sent" : "Join this ride"}</Text><ArrowRight color={colors.ink} size={16} /></Pressable>
      <Text style={styles.distanceNote}>34 MILES · ABOUT 2 HOURS</Text>
    </View>

    <View style={styles.sectionHeading}><View><Text style={styles.eyebrow}>GOOD RIDES, GOOD COMPANY</Text><Text style={styles.sectionTitle}>Rides near you <Text style={styles.count}>08</Text></Text></View><Text style={styles.seeAllText}>3 rides · Sat &amp; Sun</Text></View>
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterRow}>{["For you", "Easy pace", "Under 40 mi"].map((filter) => <Pressable accessibilityRole="button" accessibilityState={{ selected: rideFilter === filter }} key={filter} onPress={() => setRideFilter(filter)} style={[styles.filter, rideFilter === filter && styles.activeFilter]}><Text style={[styles.filterText, rideFilter === filter && styles.activeFilterText]}>{filter}</Text></Pressable>)}</ScrollView>
    <View style={styles.rideList}>{visibleRides.map((ride) => <RideCard key={ride.id} ride={ride} requested={requested.includes(ride.id)} onJoin={() => requestRide(ride.id)} />)}</View>

    <View style={styles.nearbySection}><View style={styles.sectionHeading}><View><Text style={styles.eyebrow}>A LITTLE CLOSER TO HOME</Text><Text style={styles.sectionTitle}>Riders nearby</Text></View><Navigation color={colors.leaf} size={18} /></View><Text style={styles.nearbyDescription}>People around Pacific Heights who share your routes.</Text>{nearbyRiders.slice(0, 3).map((person) => <View style={styles.personRow} key={person.id}><View style={[styles.personAvatar, { backgroundColor: person.color }]}><Text style={styles.personInitials}>{person.initials}</Text></View><View style={styles.personInfo}><Text style={styles.personName}>{person.name}</Text><Text style={styles.personNote}>{person.distance} away · {person.mutual}</Text></View><Pressable accessibilityRole="button" accessibilityLabel={`${inviteSent.includes(person.id) ? "Request sent to" : "Add"} ${person.name}`} style={[styles.addButton, inviteSent.includes(person.id) && styles.addedButton]} onPress={() => setInviteSent((current) => current.includes(person.id) ? current : [...current, person.id])}><Text style={styles.addButtonText}>{inviteSent.includes(person.id) ? "✓" : "+"}</Text></Pressable></View>)}
      <View style={styles.mutualNote}><Users color={colors.leaf} size={14} /><Text style={styles.mutualText}>Make the next ride a little less “nice to meet you.”</Text></View>
    </View>
    <CreateRideModal visible={createVisible} onClose={() => setCreateVisible(false)} onCreated={() => {}} />
  </PageShell>;
}

const styles = StyleSheet.create({
  feature: { marginHorizontal: 16, padding: 17, borderRadius: 16, backgroundColor: colors.forest },
  featureTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 12 },
  liveLabel: { flexDirection: "row", alignItems: "center", gap: 6 },
  liveDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.lime },
  featureEyebrow: { color: "#D4E1D1", fontSize: 8, fontWeight: "800", letterSpacing: 1 },
  featureIndex: { color: "#B8CCB9", fontSize: 8, fontWeight: "700" },
  featureTitle: { marginBottom: 7, color: "#F7F8EE", fontFamily: "Georgia", fontSize: 35, fontWeight: "500", lineHeight: 36 },
  featureDescription: { maxWidth: 245, marginBottom: 14, color: "#D4E0D6", fontSize: 10, lineHeight: 15 },
  featureMeta: { gap: 8, marginTop: 13 },
  metaItem: { flexDirection: "row", alignItems: "center", gap: 7 },
  metaText: { color: "#E1EADD", fontSize: 8, fontWeight: "700", letterSpacing: 0.35 },
  featureButton: { minHeight: 39, marginTop: 14, paddingHorizontal: 12, borderRadius: 8, backgroundColor: "#E7F1C7", flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  featureButtonText: { color: colors.ink, fontSize: 10, fontWeight: "800" },
  distanceNote: { marginTop: 10, color: "#AEC5B2", fontSize: 7, fontWeight: "700", letterSpacing: 0.8, textAlign: "center" },
  sectionHeading: { marginTop: 25, marginBottom: 11, paddingHorizontal: 20, flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between" },
  eyebrow: { color: colors.muted, fontSize: 8, fontWeight: "800", letterSpacing: 1 },
  sectionTitle: { marginTop: 5, color: colors.ink, fontFamily: "Georgia", fontSize: 22, fontWeight: "500" },
  count: { color: colors.subtle, fontFamily: "System", fontSize: 9 },
  seeAll: { paddingBottom: 2 },
  seeAllText: { color: colors.leaf, fontSize: 8, fontWeight: "700" },
  filterRow: { gap: 7, paddingHorizontal: 20, paddingBottom: 13 },
  activeFilter: { borderColor: colors.forest, backgroundColor: colors.forest },
  activeFilterText: { color: colors.surface },
  filter: { paddingHorizontal: 12, paddingVertical: 8, borderWidth: 1, borderColor: colors.line, borderRadius: 18, backgroundColor: colors.surface },
  filterText: { color: colors.muted, fontSize: 9, fontWeight: "600" },
  rideList: { gap: 12, paddingHorizontal: 16 },
  nearbySection: { marginTop: 26, paddingTop: 2, paddingBottom: 10 },
  nearbyDescription: { marginHorizontal: 20, marginBottom: 5, color: colors.muted, fontSize: 9 },
  personRow: { minHeight: 61, marginHorizontal: 20, borderBottomWidth: 1, borderBottomColor: colors.line, flexDirection: "row", alignItems: "center", gap: 10 },
  personAvatar: { width: 37, height: 37, borderRadius: 20, alignItems: "center", justifyContent: "center" },
  personInitials: { color: colors.surface, fontSize: 10, fontWeight: "800" },
  personInfo: { flex: 1, gap: 3 },
  personName: { color: colors.ink, fontSize: 10, fontWeight: "700" },
  personNote: { color: colors.muted, fontSize: 8 },
  addButton: { width: 29, height: 29, borderWidth: 1, borderColor: "#DCE5D7", borderRadius: 15, alignItems: "center", justifyContent: "center", backgroundColor: "#EFF3E8" },
  addedButton: { borderColor: colors.leaf, backgroundColor: colors.leaf },
  addButtonText: { color: colors.forest, fontSize: 17, lineHeight: 20 },
  mutualNote: { marginHorizontal: 20, marginTop: 12, padding: 11, borderRadius: 9, backgroundColor: "#E9EFE1", flexDirection: "row", alignItems: "center", gap: 8 },
  mutualText: { flex: 1, color: "#637769", fontSize: 8, lineHeight: 13 },
});