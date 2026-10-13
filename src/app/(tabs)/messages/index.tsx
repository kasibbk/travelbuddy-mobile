import { useState } from "react";
import { ArrowRight, MessageCircle, Users } from "lucide-react-native";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { AppHeader } from "../../../components/app-header";
import { Avatar } from "../../../components/avatar";
import { PageShell } from "../../../components/page-shell";
import { colors } from "../../../components/theme";

const conversations = [
  { id: "coastline", name: "Coastline & coffee", initials: "CC", preview: "Maya: I’ll bring the extra pump!", time: "10:42", color: colors.leaf, group: true },
  { id: "maya", name: "Maya Chen", initials: "MC", preview: "I’ll bring the extra pump!", time: "9:18", color: "#D58B68", group: false },
  { id: "theo", name: "Theo Martinez", initials: "TM", preview: "Route looks great", time: "YEST.", color: "#6B9380", group: false },
  { id: "weekend", name: "Weekend crew", initials: "WC", preview: "Nina: anyone up for Sunday?", time: "SUN", color: "#A18B6E", group: true },
];

export default function MessagesScreen() {
  const router = useRouter();
  const [tab, setTab] = useState("All");
  const visible = conversations.filter((conversation) => tab === "All" || conversation.group);
  return <PageShell><AppHeader eyebrow="MAKE THE PLAN, KEEP THE FRIEND" title="Messages" subtitle="Ride details, coffee stops, and the occasional “where are you?”" />
    <View style={styles.tabs}>{["All", "Ride chats"].map((item) => <Pressable key={item} onPress={() => setTab(item)} style={[styles.tab, tab === item && styles.tabActive]}><Text style={[styles.tabText, tab === item && styles.tabTextActive]}>{item}</Text></Pressable>)}</View>
    <View style={styles.inboxNote}><MessageCircle color={colors.leaf} size={15} /><Text style={styles.inboxNoteText}>Ride chats open when your join request is approved.</Text></View>
    <View style={styles.conversationList}>{visible.map((conversation) => <Pressable style={styles.conversation} key={conversation.id} onPress={() => router.push({ pathname: "/chat/[id]", params: { id: conversation.id } })}><View style={styles.avatarWrap}><Avatar initials={conversation.initials} color={conversation.color} size={45} />{conversation.group && <View style={styles.groupMark}><Users color={colors.surface} size={9} /></View>}</View><View style={styles.conversationContent}><View style={styles.conversationTop}><Text numberOfLines={1} style={styles.conversationName}>{conversation.name}</Text><Text style={styles.time}>{conversation.time}</Text></View><Text numberOfLines={1} style={styles.preview}>{conversation.preview}</Text><Text style={styles.memberNote}>{conversation.group ? "Ride group chat" : "TravelBuddy friend"}</Text></View><ArrowRight color="#B2BBB2" size={15} /></Pressable>)}</View>
  </PageShell>;
}

const styles = StyleSheet.create({
  tabs: { marginHorizontal: 20, marginBottom: 13, borderBottomWidth: 1, borderBottomColor: colors.line, flexDirection: "row", gap: 20 }, tab: { paddingBottom: 9 }, tabActive: { borderBottomWidth: 2, borderBottomColor: colors.forest }, tabText: { color: colors.muted, fontSize: 10, fontWeight: "600" }, tabTextActive: { color: colors.forest, fontWeight: "800" },
  inboxNote: { marginHorizontal: 16, marginBottom: 13, paddingHorizontal: 11, paddingVertical: 10, borderRadius: 8, backgroundColor: "#E9EFE1", flexDirection: "row", alignItems: "center", gap: 7 }, inboxNoteText: { flex: 1, color: "#65796A", fontSize: 8 },
  conversationList: { marginHorizontal: 16, paddingHorizontal: 12, borderWidth: 1, borderColor: colors.line, borderRadius: 11, backgroundColor: colors.surface }, conversation: { minHeight: 75, borderBottomWidth: 1, borderBottomColor: "#EEF0E9", flexDirection: "row", alignItems: "center", gap: 10 }, avatarWrap: { position: "relative" }, groupMark: { position: "absolute", right: -3, bottom: -2, width: 18, height: 18, borderRadius: 9, alignItems: "center", justifyContent: "center", borderWidth: 2, borderColor: colors.surface, backgroundColor: colors.forest },
  conversationContent: { flex: 1, gap: 4 }, conversationTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 7 }, conversationName: { flex: 1, color: colors.ink, fontSize: 10, fontWeight: "700" }, time: { color: colors.subtle, fontSize: 7, fontWeight: "700" }, preview: { color: colors.muted, fontSize: 8 }, memberNote: { color: colors.leaf, fontSize: 7 },
});