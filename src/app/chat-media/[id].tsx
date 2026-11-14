import { useCallback, useEffect, useMemo, useState } from "react";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { ArrowLeft, FileText, Film, Image as ImageIcon, Music2 } from "lucide-react-native";
import { ActivityIndicator, FlatList, Image, Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { EmptyState } from "../../components/empty-state";
import { VideoAttachmentThumbnail } from "../../components/video-attachment-thumbnail";
import { colors } from "../../components/theme";
import { useAuth } from "../../components/auth-provider";
import { getMessageImageUrl, loadConversationAttachments, SharedAttachmentData } from "../../lib/app-data";

type AttachmentCardProps = {
  attachment: SharedAttachmentData;
  layout: "grid" | "list";
  opening: boolean;
  onOpen: (attachment: SharedAttachmentData) => void;
};

function AttachmentCard({ attachment, layout, opening, onOpen }: AttachmentCardProps) {
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(attachment.kind === "image");

  useEffect(() => {
    if (attachment.kind !== "image") return;
    let active = true;
    getMessageImageUrl(attachment.attachmentPath)
      .then((url) => { if (active) setImageUrl(url); })
      .catch((cause: unknown) => console.warn("[chat-media] Could not load image preview", cause))
      .finally(() => { if (active) setPreviewLoading(false); });
    return () => { active = false; };
  }, [attachment.id, attachment.attachmentPath, attachment.kind]);

  const Icon = attachment.kind === "video" ? Film : attachment.kind === "audio" ? Music2 : attachment.kind === "image" ? ImageIcon : FileText;
  const date = new Date(attachment.createdAt).toLocaleDateString();

  return <Pressable accessibilityRole="button" accessibilityLabel={`Open ${attachment.attachmentName}`} onPress={() => onOpen(attachment)} style={layout === "grid" ? styles.mediaCard : styles.documentCard}>
    {layout === "grid"
      ? <View style={styles.mediaPreview}>
        {attachment.kind === "image" && imageUrl
          ? <Image source={{ uri: imageUrl }} resizeMode="cover" style={styles.mediaImage} />
          : attachment.kind === "video"
            ? <VideoAttachmentThumbnail attachmentPath={attachment.attachmentPath} style={styles.mediaImage} />
          : <View style={styles.mediaPlaceholder}>{opening || previewLoading ? <ActivityIndicator size="small" color={colors.forest} /> : <Icon color={colors.forest} size={24} />}</View>}
      </View>
      : <View style={styles.documentIcon}>{opening ? <ActivityIndicator size="small" color={colors.forest} /> : <Icon color={colors.forest} size={18} />}</View>}
    <View style={layout === "grid" ? styles.mediaCopy : styles.documentCopy}>
      <Text numberOfLines={1} style={styles.attachmentName}>{attachment.attachmentName}</Text>
      <Text numberOfLines={1} style={styles.attachmentDetail}>{layout === "grid" ? `${attachment.kind} · ${date}` : `${attachment.attachmentMimeType ?? "File"} · ${date}`}</Text>
    </View>
  </Pressable>;
}

export default function ChatMediaScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { ready, userId } = useAuth();
  const [attachments, setAttachments] = useState<SharedAttachmentData[]>([]);
  const [tab, setTab] = useState<"media" | "documents">("media");
  const [loading, setLoading] = useState(true);
  const [openingId, setOpeningId] = useState("");
  const [error, setError] = useState("");

  useFocusEffect(useCallback(() => {
    if (!ready || !userId || !id || Array.isArray(id)) return;
    let active = true;
    setLoading(true);
    setError("");
    loadConversationAttachments(id, userId)
      .then((rows) => { if (active) setAttachments(rows); })
      .catch((cause: unknown) => {
        if (active) setError(cause instanceof Error ? cause.message : "Could not load shared attachments.");
      })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [ready, userId, id]));

  const media = useMemo(() => attachments.filter((item) => item.kind !== "document"), [attachments]);
  const documents = useMemo(() => attachments.filter((item) => item.kind === "document"), [attachments]);
  const visibleItems = tab === "media" ? media : documents;

  function openAttachment(attachment: SharedAttachmentData) {
    if (openingId) return;
    setOpeningId(attachment.id);
    setError("");
    router.push({ pathname: "/chat-attachment/[id]", params: { id: attachment.id, conversationId: typeof id === "string" ? id : "" } });
    setOpeningId("");
  }

  return <View style={styles.screen}>
    <View style={[styles.header, { paddingTop: Math.max(8, insets.top + 6) }]}>
      <Pressable accessibilityRole="button" accessibilityLabel="Back to chat details" onPress={() => router.back()} style={styles.back}><ArrowLeft color={colors.ink} size={19} /></Pressable>
      <View style={styles.heading}><Text style={styles.title}>Shared files</Text><Text style={styles.subtitle}>Media and documents from this chat</Text></View>
    </View>
    <View style={styles.tabs}>
      <Pressable accessibilityRole="tab" accessibilityState={{ selected: tab === "media" }} onPress={() => setTab("media")} style={[styles.tab, tab === "media" && styles.selectedTab]}>
        <Text style={[styles.tabText, tab === "media" && styles.selectedTabText]}>Media ({media.length})</Text>
      </Pressable>
      <Pressable accessibilityRole="tab" accessibilityState={{ selected: tab === "documents" }} onPress={() => setTab("documents")} style={[styles.tab, tab === "documents" && styles.selectedTab]}>
        <Text style={[styles.tabText, tab === "documents" && styles.selectedTabText]}>Documents ({documents.length})</Text>
      </Pressable>
    </View>
    {!!error && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
    {loading
      ? <ActivityIndicator color={colors.leaf} style={styles.loader} />
      : <FlatList
        key={tab}
        data={visibleItems}
        keyExtractor={(item) => item.id}
        numColumns={tab === "media" ? 2 : 1}
        columnWrapperStyle={tab === "media" ? styles.gridRow : undefined}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => <AttachmentCard attachment={item} layout={tab === "media" ? "grid" : "list"} opening={openingId === item.id} onOpen={openAttachment} />}
        ListEmptyComponent={<EmptyState icon={tab === "media" ? ImageIcon : FileText} title={tab === "media" ? "No media shared" : "No documents shared"} description={tab === "media" ? "Photos, videos, and audio shared in this chat will appear here." : "Files shared in this chat will appear here."} />}
      />}
  </View>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.paper },
  header: { minHeight: 72, paddingHorizontal: 15, paddingBottom: 10, flexDirection: "row", alignItems: "center", gap: 11 },
  back: { width: 36, height: 38, alignItems: "center", justifyContent: "center", borderRadius: 10, backgroundColor: colors.surface },
  heading: { flex: 1, gap: 3 },
  title: { color: colors.ink, fontSize: 15, fontWeight: "800" },
  subtitle: { color: colors.muted, fontSize: 9 },
  tabs: { marginHorizontal: 16, marginBottom: 10, borderBottomWidth: 1, borderBottomColor: colors.line, flexDirection: "row", gap: 20 },
  tab: { paddingVertical: 9 },
  selectedTab: { borderBottomWidth: 2, borderBottomColor: colors.forest },
  tabText: { color: colors.muted, fontSize: 10, fontWeight: "700" },
  selectedTabText: { color: colors.forest },
  error: { marginHorizontal: 16, marginBottom: 8, color: "#9B493C", fontSize: 9 },
  loader: { marginTop: 28 },
  list: { flexGrow: 1, paddingHorizontal: 16, paddingBottom: 24 },
  gridRow: { justifyContent: "space-between", gap: 10, marginBottom: 10 },
  mediaCard: { flex: 1, maxWidth: "49%", minHeight: 150, overflow: "hidden", borderWidth: 1, borderColor: colors.line, borderRadius: 11, backgroundColor: colors.surface },
  mediaPreview: { height: 112, backgroundColor: colors.paleGreen },
  mediaImage: { width: "100%", height: "100%" },
  mediaPlaceholder: { flex: 1, alignItems: "center", justifyContent: "center" },
  mediaCopy: { paddingHorizontal: 9, paddingVertical: 7, gap: 4 },
  attachmentName: { color: colors.ink, fontSize: 9, fontWeight: "700" },
  attachmentDetail: { color: colors.muted, fontSize: 7 },
  documentCard: { minHeight: 62, paddingHorizontal: 10, borderBottomWidth: 1, borderBottomColor: colors.line, flexDirection: "row", alignItems: "center", gap: 10 },
  documentIcon: { width: 36, height: 36, borderRadius: 9, alignItems: "center", justifyContent: "center", backgroundColor: colors.paleGreen },
  documentCopy: { flex: 1, gap: 4 },
});
