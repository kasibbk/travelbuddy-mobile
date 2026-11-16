import { useCallback, useEffect, useState } from "react";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { useAudioPlayer, useAudioPlayerStatus, setAudioModeAsync } from "expo-audio";
import { ArrowLeft, FileText, Pause, Play, RotateCcw, RotateCw } from "lucide-react-native";
import { ActivityIndicator, Image, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from "react-native";
import Pdf from "react-native-pdf";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { EmptyState } from "../../components/empty-state";
import { colors } from "../../components/theme";
import { useAuth } from "../../components/auth-provider";
import { loadConversationAttachment, SharedAttachmentData } from "../../lib/app-data";
import { VideoView, useVideoPlayer } from "expo-video";

type LoadedAttachment = SharedAttachmentData & { signedUrl: string };

function isPdf(attachment: SharedAttachmentData): boolean {
  return attachment.attachmentMimeType === "application/pdf" || /\.pdf$/i.test(attachment.attachmentName);
}

function isTextDocument(attachment: SharedAttachmentData): boolean {
  return attachment.attachmentMimeType?.startsWith("text/")
    || /\.(txt|csv|md|json|xml|html|htm|log)$/i.test(attachment.attachmentName);
}

function formatTime(seconds: number): string {
  const safeSeconds = Number.isFinite(seconds) ? Math.max(0, Math.floor(seconds)) : 0;
  return `${Math.floor(safeSeconds / 60)}:${String(safeSeconds % 60).padStart(2, "0")}`;
}

function VideoAttachment({ uri }: { uri: string }) {
  const player = useVideoPlayer(uri);
  return <VideoView style={styles.video} player={player} nativeControls fullscreenOptions={{ enable: true }} contentFit="contain" />;
}

function AudioAttachment({ uri, title }: { uri: string; title: string }) {
  const player = useAudioPlayer(uri, { updateInterval: 500 });
  const status = useAudioPlayerStatus(player);
  const [audioError, setAudioError] = useState("");

  useEffect(() => {
    setAudioModeAsync({ playsInSilentMode: true })
      .catch((cause: unknown) => setAudioError(cause instanceof Error ? cause.message : "Could not configure audio playback."));
  }, []);

  const seek = (seconds: number) => {
    void player.seekTo(Math.min(status.duration || 0, Math.max(0, status.currentTime + seconds)))
      .catch((cause: unknown) => setAudioError(cause instanceof Error ? cause.message : "Could not seek in this audio file."));
  };

  return <View style={styles.audioCard}>
    <View style={styles.audioIcon}><FileText color={colors.forest} size={22} /></View>
    <Text numberOfLines={2} style={styles.audioTitle}>{title}</Text>
    <View style={styles.audioControls}>
      <Pressable accessibilityRole="button" accessibilityLabel="Back 15 seconds" onPress={() => seek(-15)} style={styles.skipButton}><RotateCcw color={colors.forest} size={20} /><Text style={styles.skipLabel}>15</Text></Pressable>
      <Pressable accessibilityRole="button" accessibilityLabel={status.playing ? "Pause audio" : "Play audio"} onPress={() => status.playing ? player.pause() : player.play()} style={styles.playButton}>
        {status.playing ? <Pause color={colors.surface} size={20} fill={colors.surface} /> : <Play color={colors.surface} size={20} fill={colors.surface} />}
      </Pressable>
      <Pressable accessibilityRole="button" accessibilityLabel="Forward 15 seconds" onPress={() => seek(15)} style={styles.skipButton}><RotateCw color={colors.forest} size={20} /><Text style={styles.skipLabel}>15</Text></Pressable>
    </View>
    <View style={styles.audioProgressTrack}><View style={[styles.audioProgressFill, { width: `${status.duration ? Math.min(100, status.currentTime / status.duration * 100) : 0}%` }]} /></View>
    <View style={styles.audioTimeRow}><Text style={styles.audioTime}>{formatTime(status.currentTime)}</Text><Text style={styles.audioTime}>{formatTime(status.duration)}</Text></View>
    {!!audioError && <Text accessibilityRole="alert" style={styles.viewerError}>{audioError}</Text>}
  </View>;
}

export default function ChatAttachmentScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const { id, conversationId: conversationParam } = useLocalSearchParams<{ id: string; conversationId: string }>();
  const conversationId = typeof conversationParam === "string" ? conversationParam : null;
  const { ready, userId } = useAuth();
  const [attachment, setAttachment] = useState<LoadedAttachment | null>(null);
  const [textContent, setTextContent] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useFocusEffect(useCallback(() => {
    if (!ready || !userId || !conversationId || !id || Array.isArray(id)) return;
    let active = true;
    setLoading(true);
    setError("");
    loadConversationAttachment(conversationId, userId, id)
      .then((item) => {
        if (active) setAttachment(item);
      })
      .catch((cause: unknown) => {
        if (active) setError(cause instanceof Error ? cause.message : "Could not load this attachment.");
      })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [ready, userId, conversationId, id]));

  useEffect(() => {
    if (!attachment || !isTextDocument(attachment)) return;
    let active = true;
    fetch(attachment.signedUrl)
      .then((response) => {
        if (!response.ok) throw new Error("Could not read this document.");
        return response.text();
      })
      .then((text) => { if (active) setTextContent(text); })
      .catch((cause: unknown) => {
        if (active) setError(cause instanceof Error ? cause.message : "Could not read this document.");
      });
    return () => { active = false; };
  }, [attachment]);

  return <View style={styles.screen}>
    <View style={[styles.header, { paddingTop: Math.max(8, insets.top + 6) }]}>
      <Pressable accessibilityRole="button" accessibilityLabel="Back to chat" onPress={() => router.back()} style={styles.back}><ArrowLeft color={colors.ink} size={19} /></Pressable>
      <Text numberOfLines={1} style={styles.headerTitle}>{attachment?.attachmentName ?? "Attachment"}</Text>
    </View>
    {loading ? <ActivityIndicator color={colors.leaf} style={styles.loader} />
      : error && !attachment ? <EmptyState icon={FileText} title="Attachment unavailable" description={error} />
        : attachment && isPdf(attachment) ? <Pdf
          source={{ uri: attachment.signedUrl, cache: true }}
          style={{ width, height: height - insets.top - insets.bottom - 58 }}
          trustAllCerts={false}
          onError={(cause) => setError(cause.message || "Could not display this PDF.")}
        />
          : attachment?.kind === "image" ? <View style={styles.imageStage}><Image source={{ uri: attachment.signedUrl }} resizeMode="contain" style={styles.image} /></View>
            : attachment?.kind === "video" ? <View style={styles.videoStage}><VideoAttachment uri={attachment.signedUrl} /></View>
              : attachment?.kind === "audio" ? <View style={styles.centered}><AudioAttachment uri={attachment.signedUrl} title={attachment.attachmentName} /></View>
                : attachment && isTextDocument(attachment) ? <ScrollView contentContainerStyle={styles.textDocument}><Text selectable style={styles.documentText}>{textContent}</Text></ScrollView>
                  : attachment ? <View style={styles.centered}><View style={styles.unsupportedCard}><FileText color={colors.forest} size={34} /><Text style={styles.unsupportedTitle}>Preview not available</Text><Text style={styles.unsupportedCopy}>This file type cannot be displayed inside the app.</Text><Text style={styles.mimeType}>{attachment.attachmentMimeType ?? "Unknown file type"}</Text></View></View>
                    : null}
    {!!error && !!attachment && <Text accessibilityRole="alert" style={styles.viewerError}>{error}</Text>}
  </View>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.paper },
  header: { minHeight: 54, paddingHorizontal: 15, paddingBottom: 8, flexDirection: "row", alignItems: "center", gap: 10 },
  back: { width: 36, height: 38, alignItems: "center", justifyContent: "center", borderRadius: 10, backgroundColor: colors.surface },
  headerTitle: { flex: 1, color: colors.ink, fontSize: 11, fontWeight: "800" },
  loader: { marginTop: 28 },
  imageStage: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: "#111" },
  image: { width: "100%", height: "100%" },
  videoStage: { flex: 1, justifyContent: "center", backgroundColor: "#111" },
  video: { width: "100%", aspectRatio: 16 / 9 },
  centered: { flex: 1, padding: 20, alignItems: "center", justifyContent: "center" },
  audioCard: { width: "100%", maxWidth: 420, padding: 22, borderWidth: 1, borderColor: colors.line, borderRadius: 18, backgroundColor: colors.surface, alignItems: "center", gap: 17 },
  audioIcon: { width: 62, height: 62, borderRadius: 18, alignItems: "center", justifyContent: "center", backgroundColor: colors.paleGreen },
  audioTitle: { width: "100%", color: colors.ink, fontSize: 12, fontWeight: "800", textAlign: "center" },
  audioControls: { flexDirection: "row", alignItems: "center", gap: 24 },
  skipButton: { width: 42, height: 42, alignItems: "center", justifyContent: "center" },
  skipLabel: { position: "absolute", color: colors.forest, fontSize: 7, fontWeight: "800" },
  playButton: { width: 56, height: 56, borderRadius: 28, alignItems: "center", justifyContent: "center", backgroundColor: colors.forest },
  audioProgressTrack: { width: "100%", height: 5, borderRadius: 3, backgroundColor: colors.line, overflow: "hidden" },
  audioProgressFill: { height: "100%", borderRadius: 3, backgroundColor: colors.leaf },
  audioTimeRow: { width: "100%", flexDirection: "row", justifyContent: "space-between" },
  audioTime: { color: colors.muted, fontSize: 8 },
  textDocument: { padding: 16 },
  documentText: { color: colors.ink, fontSize: 10, lineHeight: 16, fontFamily: "monospace" },
  unsupportedCard: { width: "100%", maxWidth: 320, padding: 24, alignItems: "center", gap: 12, borderWidth: 1, borderColor: colors.line, borderRadius: 16, backgroundColor: colors.surface },
  unsupportedTitle: { color: colors.ink, fontSize: 12, fontWeight: "800" },
  unsupportedCopy: { color: colors.muted, fontSize: 9, textAlign: "center" },
  mimeType: { color: colors.subtle, fontSize: 8 },
  viewerError: { marginHorizontal: 16, marginVertical: 8, color: "#9B493C", fontSize: 9 },
});
