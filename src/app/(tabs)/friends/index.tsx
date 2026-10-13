import { useMemo, useState } from "react";
import { MapPin, Search, Users } from "lucide-react-native";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { AppHeader } from "../../../components/app-header";
import { Avatar } from "../../../components/avatar";
import { PageShell } from "../../../components/page-shell";
import { colors } from "../../../components/theme";
import { nearbyRiders } from "../../../lib/demo-data";

export default function FriendsScreen() {
  const [tab, setTab] = useState("Nearby");
  const [query, setQuery] = useState("");
  const [sent, setSent] = useState<string[]>([]);
  const people = useMemo(() => nearbyRiders.filter((person) => person.name.toLowerCase().includes(query.toLowerCase()) && (tab !== "Your friends" || sent.includes(person.id))), [query, sent, tab]);
  return <PageShell><AppHeader eyebrow="GOOD COMPANY TRAVELS" title="Find your people" subtitle="Meet nearby riders. Make your next ride a reunion." />
    <View style={styles.locationCard}><View style={styles.locationIcon}><MapPin color={colors.leaf} size={17} /></View><View style={styles.locationCopy}><Text style={styles.locationTitle}>Around Pacific Heights</Text><Text style={styles.locationSubtitle}>Suggestions based on your ride area</Text></View><Text style={styles.change}>CHANGE</Text></View>
    <View style={styles.tabs}>{["Nearby", "Requests sent"].map((item) => <Pressable key={item} onPress={() => setTab(item)} style={[styles.tab, tab === item && styles.tabActive]}><Text style={[styles.tabText, tab === item && styles.tabTextActive]}>{item}{item === "Requests sent" ? ` · ${sent.length}` : ""}</Text></Pressable>)}</View>
    <View style={styles.search}><Search color={colors.subtle} size={16} /><TextInput value={query} onChangeText={setQuery} placeholder="Search riders nearby" placeholderTextColor={colors.subtle} style={styles.searchInput} /></View>
    <View style={styles.listHeader}><Text style={styles.eyebrow}>{tab === "Nearby" ? "RIDERS WHO MIGHT BE YOUR PEOPLE" : "REQUESTS YOU’VE SENT"}</Text><Text style={styles.count}>{people.length} riders</Text></View>
    <View style={styles.peopleList}>{people.map((person) => <View style={styles.personCard} key={person.id}><Avatar initials={person.initials} color={person.color} size={44} /><View style={styles.personInfo}><View style={styles.personTitleLine}><Text style={styles.personName}>{person.name}</Text><Text style={styles.distance}><MapPin size={10} color={colors.orange} /> {person.distance}</Text></View><Text style={styles.personNote}>{person.note}</Text><View style={styles.mutual}><Users color={colors.leaf} size={11} /><Text style={styles.mutualText}>{person.mutual}</Text></View></View><Pressable onPress={() => setSent((current) => current.includes(person.id) ? current : [...current, person.id])} style={[styles.add, sent.includes(person.id) && styles.added]}><Text style={[styles.addLabel, sent.includes(person.id) && styles.addedLabel]}>{sent.includes(person.id) ? "Sent" : "+ Add"}</Text></Pressable></View>)}</View>
    {people.length === 0 && <View style={styles.empty}><Text style={styles.emptyText}>No riders found here yet.</Text></View>}
  </PageShell>;
}

const styles = StyleSheet.create({
  locationCard: { marginHorizontal: 16, marginBottom: 16, padding: 12, borderRadius: 11, backgroundColor: "#E8EDDF", flexDirection: "row", alignItems: "center", gap: 10 },
  locationIcon: { width: 32, height: 32, borderRadius: 9, alignItems: "center", justifyContent: "center", backgroundColor: "#F8F9F3" }, locationCopy: { flex: 1, gap: 3 }, locationTitle: { color: colors.ink, fontSize: 10, fontWeight: "700" }, locationSubtitle: { color: colors.muted, fontSize: 8 }, change: { color: colors.leaf, fontSize: 7, fontWeight: "800", letterSpacing: 0.5 },
  tabs: { marginHorizontal: 20, marginBottom: 12, borderBottomWidth: 1, borderBottomColor: colors.line, flexDirection: "row", gap: 20 }, tab: { paddingBottom: 9 }, tabActive: { borderBottomWidth: 2, borderBottomColor: colors.forest }, tabText: { color: colors.muted, fontSize: 10, fontWeight: "600" }, tabTextActive: { color: colors.forest, fontWeight: "800" },
  search: { height: 39, marginHorizontal: 16, marginBottom: 18, paddingHorizontal: 11, borderWidth: 1, borderColor: colors.line, borderRadius: 8, backgroundColor: colors.surface, flexDirection: "row", alignItems: "center", gap: 8 }, searchInput: { flex: 1, color: colors.ink, fontSize: 10 },
  listHeader: { marginHorizontal: 20, marginBottom: 7, flexDirection: "row", justifyContent: "space-between", alignItems: "center" }, eyebrow: { color: colors.muted, fontSize: 7, fontWeight: "800", letterSpacing: 0.7 }, count: { color: colors.subtle, fontSize: 8 },
  peopleList: { marginHorizontal: 16, paddingHorizontal: 12, borderWidth: 1, borderColor: colors.line, borderRadius: 11, backgroundColor: colors.surface }, personCard: { minHeight: 76, borderBottomWidth: 1, borderBottomColor: "#EEF0E9", flexDirection: "row", alignItems: "center", gap: 9 }, personInfo: { flex: 1, gap: 4 }, personTitleLine: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 5 }, personName: { color: colors.ink, fontSize: 10, fontWeight: "700" }, distance: { color: colors.muted, fontSize: 8 }, personNote: { color: colors.muted, fontSize: 8 }, mutual: { flexDirection: "row", alignItems: "center", gap: 4 }, mutualText: { color: colors.leaf, fontSize: 7 }, add: { minWidth: 46, height: 29, paddingHorizontal: 8, borderWidth: 1, borderColor: "#DAE4D7", borderRadius: 7, alignItems: "center", justifyContent: "center", backgroundColor: "#F3F5EC" }, added: { borderColor: colors.leaf, backgroundColor: colors.leaf }, addLabel: { color: colors.forest, fontSize: 8, fontWeight: "700" }, addedLabel: { color: colors.surface }, empty: { margin: 16, padding: 24, alignItems: "center" }, emptyText: { color: colors.muted, fontSize: 10 },
});