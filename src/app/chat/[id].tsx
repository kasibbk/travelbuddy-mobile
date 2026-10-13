import { useState } from "react";
import { ArrowLeft, MapPin, MoreHorizontal, Send } from "lucide-react-native";
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Avatar } from "../../components/avatar";
import { colors } from "../../components/theme";

const conversationInfo: Record<string, { name: string; initials: string; color: string; subline: string }> = {
  coastline: { name: "Coastline & coffee", initials: "CC", color: colors.leaf, subline: "Maya, Theo, Jamie + 2" },
  maya: { name: "Maya Chen", initials: "MC", color: "#D58B68", subline: "TravelBuddy friend" },
  theo: { name: "Theo Martinez", initials: "TM", color: "#6B9380", subline: "TravelBuddy friend" },
  weekend: { name: "Weekend crew", initials: "WC", color: "#A18B6E", subline: "Ride group chat" },
};

export default function ChatScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ id: string }>();
  const conversation = conversationInfo[params.id] ?? conversationInfo.coastline;
  const [draft, setDraft] = useState("");
  const [sent, setSent] = useState<string[]>([]);
  function send() { if (!draft.trim()) return; setSent((current) => [...current, draft.trim()]); setDraft(""); }
  return <View style={styles.screen}><View style={styles.header}><Pressable style={styles.back} onPress={() => router.back()}><ArrowLeft color={colors.ink} size={19} /></Pressable><Avatar initials={conversation.initials} color={conversation.color} size={38} /><View style={styles.headerText}><Text numberOfLines={1} style={styles.name}>{conversation.name}</Text><Text style={styles.subline}>{conversation.subline}</Text></View><Pressable style={styles.more}><MoreHorizontal color={colors.muted} size={20} /></Pressable></View>{params.id === "coastline" && <View style={styles.rideLink}><MapPin color={colors.leaf} size={13} /><Text style={styles.rideLinkText}>San Francisco → Half Moon Bay</Text><Text style={styles.rideLinkDate}>SAT, OCT 17</Text></View>}<ScrollView style={styles.messages} contentContainerStyle={styles.messageContent}><Text style={styles.dateDivider}>TODAY · OCTOBER 12</Text><View style={styles.bubble}><Text style={styles.message}>Hey everyone! Stoked to get out to the coast this weekend. Meet at the Ferry Building at 8:30?</Text><Text style={styles.messageTime}>MAYA · 10:12</Text></View><View style={[styles.bubble, styles.myBubble]}><Text style={styles.message}>Works for me. I’ll bring coffee for the first stop.</Text><Text style={styles.messageTime}>10:28</Text></View><View style={styles.bubble}><Text style={styles.message}>Perfect. I’ll add the route to the ride details tonight.</Text><Text style={styles.messageTime}>THEO · 10:42</Text></View>{sent.map((message, index) => <View style={[styles.bubble, styles.myBubble]} key={`${index}-${message}`}><Text style={styles.message}>{message}</Text><Text style={styles.messageTime}>NOW</Text></View>)}</ScrollView><View style={styles.composer}><TextInput value={draft} onChangeText={setDraft} placeholder="Write a message…" placeholderTextColor={colors.subtle} multiline style={styles.input} /><Pressable accessibilityLabel="Send message" onPress={send} style={styles.send}><Send color={colors.surface} size={16} /></Pressable></View></View>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.paper }, header: { minHeight: 66, paddingHorizontal: 14, borderBottomWidth: 1, borderBottomColor: colors.line, backgroundColor: colors.surface, flexDirection: "row", alignItems: "center", gap: 9 }, back: { width: 28, height: 38, alignItems: "flex-start", justifyContent: "center" }, headerText: { flex: 1, gap: 3 }, name: { color: colors.ink, fontSize: 11, fontWeight: "700" }, subline: { color: colors.muted, fontSize: 8 }, more: { width: 30, height: 35, alignItems: "center", justifyContent: "center" },
  rideLink: { minHeight: 35, paddingHorizontal: 14, borderBottomWidth: 1, borderBottomColor: colors.line, backgroundColor: "#EEF2E8", flexDirection: "row", alignItems: "center", gap: 6 }, rideLinkText: { flex: 1, color: colors.forest, fontSize: 8, fontWeight: "600" }, rideLinkDate: { color: colors.muted, fontSize: 7, fontWeight: "700" },
  messages: { flex: 1 }, messageContent: { gap: 13, padding: 16, paddingBottom: 24 }, dateDivider: { alignSelf: "center", marginBottom: 3, color: colors.subtle, fontSize: 7, fontWeight: "700", letterSpacing: 0.5 }, bubble: { maxWidth: "84%", alignSelf: "flex-start", padding: 11, borderWidth: 1, borderColor: colors.line, borderTopLeftRadius: 4, borderTopRightRadius: 13, borderBottomRightRadius: 13, borderBottomLeftRadius: 13, backgroundColor: colors.surface }, myBubble: { alignSelf: "flex-end", borderColor: "#DFE8D6", borderTopLeftRadius: 13, borderTopRightRadius: 4, backgroundColor: "#EAF0DF" }, message: { color: "#40554A", fontSize: 10, lineHeight: 15 }, messageTime: { marginTop: 6, color: colors.subtle, fontSize: 7, textAlign: "right" },
  composer: { minHeight: 61, paddingHorizontal: 12, paddingVertical: 9, borderTopWidth: 1, borderTopColor: colors.line, backgroundColor: colors.surface, flexDirection: "row", alignItems: "flex-end", gap: 8 }, input: { minHeight: 39, maxHeight: 90, flex: 1, paddingHorizontal: 11, paddingVertical: 9, borderWidth: 1, borderColor: colors.line, borderRadius: 9, backgroundColor: "#F9FAF6", color: colors.ink, fontSize: 10 }, send: { width: 39, height: 39, borderRadius: 10, alignItems: "center", justifyContent: "center", backgroundColor: colors.forest },
});