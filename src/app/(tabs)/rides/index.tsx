import { useState } from "react";
import { Check, ShieldCheck, X } from "lucide-react-native";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { AppHeader } from "../../../components/app-header";
import { PageShell } from "../../../components/page-shell";
import { RideCard } from "../../../components/ride-card";
import { Avatar } from "../../../components/avatar";
import { colors } from "../../../components/theme";
import { nearbyRiders, rides } from "../../../lib/demo-data";

const initialRequests = [
  { id: "alex", ride: "Coastline & coffee", message: "Rode with Maya Chen", status: "pending" },
  { id: "jordan", ride: "Coastline & coffee", message: "2 mutual friends", status: "pending" },
];

export default function MyRidesScreen() {
  const [tab, setTab] = useState("Upcoming");
  const [requests, setRequests] = useState(initialRequests);
  const [decisions, setDecisions] = useState<Record<string, string>>({});
  function decide(id: string, decision: string) {
    setDecisions((current) => ({ ...current, [id]: decision }));
    setRequests((current) => current.filter((request) => request.id !== id));
  }
  return <PageShell><AppHeader eyebrow="YOUR ROUTES, YOUR CREW" title="My rides" subtitle="Everything you’re planning or taking the lead on." />
    <View style={styles.stats}><Stat value="02" label="UPCOMING" /><View style={styles.statDivider} /><Stat value={String(requests.length).padStart(2, "0")} label="TO REVIEW" /><View style={styles.statDivider} /><Stat value="11" label="COMPLETED" /></View>
    <View style={styles.tabs}>{["Upcoming", "Requests", "Past"].map((item) => <Pressable key={item} style={[styles.tab, tab === item && styles.activeTab]} onPress={() => setTab(item)}><Text style={[styles.tabText, tab === item && styles.activeTabText]}>{item}{item === "Requests" && requests.length ? ` · ${requests.length}` : ""}</Text></Pressable>)}</View>
    {tab === "Requests" ? <View style={styles.requestPanel}><View style={styles.requestHeader}><View><Text style={styles.eyebrow}>YOU’RE THE RIDE ADMIN</Text><Text style={styles.panelTitle}>Join requests</Text></View><ShieldCheck color={colors.leaf} size={21} /></View><Text style={styles.helper}>Only you and admins you invite can approve riders.</Text>{Object.entries(decisions).map(([id, decision]) => <View style={styles.approvedRow} key={id}><Check color={colors.leaf} size={14} /><Text style={styles.approvedText}>{nearbyRiders.find((person) => person.id === id)?.name} {decision.toLowerCase()} for Coastline &amp; coffee</Text></View>)}{requests.length ? requests.map((request) => { const person = nearbyRiders.find((rider) => rider.id === request.id)!; return <View style={styles.requestRow} key={request.id}><Avatar initials={person.initials} color={person.color} size={38} /><View style={styles.requestInfo}><Text style={styles.requestName}>{person.name}</Text><Text style={styles.requestMessage}>{request.message} · {request.ride}</Text></View><Pressable accessibilityLabel={`Approve ${person.name}`} style={styles.approveButton} onPress={() => decide(request.id, "Approved")}><Check color={colors.forest} size={17} /></Pressable><Pressable accessibilityLabel={`Decline ${person.name}`} style={styles.declineButton} onPress={() => decide(request.id, "Declined")}><X color="#9B684F" size={16} /></Pressable></View>; }) : Object.keys(decisions).length === 0 ? <Text style={styles.empty}>You’re all caught up. New requests will appear here.</Text> : null}</View> : <View style={styles.rideList}>{(tab === "Past" ? [] : rides).map((ride) => <View key={ride.id}><RideCard ride={ride} requested={ride.id === "coastline"} /></View>)}{tab === "Past" && <Text style={styles.empty}>Your finished rides will find a home here.</Text>}</View>}
  </PageShell>;
}

function Stat({ value, label }: { value: string; label: string }) {
  return <View style={styles.stat}><Text style={styles.statValue}>{value}</Text><Text style={styles.statLabel}>{label}</Text></View>;
}

const styles = StyleSheet.create({
  stats: { marginHorizontal: 20, marginBottom: 17, paddingVertical: 14, borderRadius: 12, backgroundColor: colors.surface, flexDirection: "row", alignItems: "center", justifyContent: "space-around" },
  stat: { alignItems: "center", gap: 3 }, statValue: { color: colors.ink, fontFamily: "Georgia", fontSize: 21 }, statLabel: { color: colors.muted, fontSize: 7, fontWeight: "800", letterSpacing: 0.7 }, statDivider: { width: 1, height: 28, backgroundColor: colors.line },
  tabs: { marginHorizontal: 20, marginBottom: 14, padding: 3, borderRadius: 9, backgroundColor: "#EAEEE6", flexDirection: "row" },
  tab: { flex: 1, minHeight: 34, borderRadius: 7, alignItems: "center", justifyContent: "center" }, activeTab: { backgroundColor: colors.surface }, tabText: { color: colors.muted, fontSize: 9, fontWeight: "600" }, activeTabText: { color: colors.forest, fontWeight: "800" },
  rideList: { gap: 12, paddingHorizontal: 16 },
  requestPanel: { marginHorizontal: 16, padding: 15, borderWidth: 1, borderColor: colors.line, borderRadius: 12, backgroundColor: colors.surface },
  requestHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" }, eyebrow: { color: colors.muted, fontSize: 8, fontWeight: "800", letterSpacing: 0.8 }, panelTitle: { marginTop: 4, color: colors.ink, fontFamily: "Georgia", fontSize: 21 }, helper: { marginTop: 8, marginBottom: 11, color: colors.muted, fontSize: 9, lineHeight: 14 },
  requestRow: { minHeight: 57, borderTopWidth: 1, borderTopColor: colors.line, flexDirection: "row", alignItems: "center", gap: 8 }, requestInfo: { flex: 1, gap: 3 }, requestName: { color: colors.ink, fontSize: 10, fontWeight: "700" }, requestMessage: { color: colors.muted, fontSize: 7 }, approveButton: { width: 29, height: 29, borderRadius: 15, alignItems: "center", justifyContent: "center", backgroundColor: colors.paleGreen }, declineButton: { width: 29, height: 29, borderRadius: 15, alignItems: "center", justifyContent: "center", backgroundColor: "#F8EEEA" },
  approvedRow: { minHeight: 33, borderTopWidth: 1, borderTopColor: colors.line, flexDirection: "row", alignItems: "center", gap: 6 }, approvedText: { color: colors.leaf, fontSize: 8 }, empty: { marginHorizontal: 20, paddingVertical: 26, color: colors.muted, fontSize: 10, textAlign: "center" },
});