import { useEffect, useState } from "react";
import { Play, Video as VideoIcon } from "lucide-react-native";
import { ActivityIndicator, StyleSheet, View } from "react-native";
import type { StyleProp, ViewStyle } from "react-native";
import { Image } from "expo-image";
import { createVideoPlayer } from "expo-video";
import type { VideoThumbnail } from "expo-video";
import { colors } from "./theme";
import { getMessageImageUrl } from "../lib/app-data";

type VideoAttachmentThumbnailProps = {
  attachmentPath: string;
  style: StyleProp<ViewStyle>;
};

export function VideoAttachmentThumbnail({ attachmentPath, style }: VideoAttachmentThumbnailProps) {
  const [thumbnail, setThumbnail] = useState<VideoThumbnail | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    let player: ReturnType<typeof createVideoPlayer> | null = null;
    async function generateThumbnail() {
      try {
        const signedUrl = await getMessageImageUrl(attachmentPath);
        if (!active) return;
        player = createVideoPlayer(signedUrl);
        player.muted = true;
        let thumbnails: VideoThumbnail[];
        try {
          thumbnails = await player.generateThumbnailsAsync(1, { maxWidth: 360, maxHeight: 240 });
        } catch {
          thumbnails = await player.generateThumbnailsAsync(0, { maxWidth: 360, maxHeight: 240 });
        }
        if (active && thumbnails[0]) setThumbnail(thumbnails[0]);
      } catch (cause) {
        console.warn("[chat] Could not generate video attachment thumbnail", cause);
      } finally {
        if (active) setLoading(false);
      }
    }
    void generateThumbnail();
    return () => {
      active = false;
      player?.release();
    };
  }, [attachmentPath]);

  return <View style={[style, styles.frame]}>
    {thumbnail
      ? <Image source={thumbnail} contentFit="cover" style={StyleSheet.absoluteFill} />
      : loading
        ? <ActivityIndicator size="small" color={colors.forest} />
        : <VideoIcon color={colors.forest} size={19} />}
    {thumbnail && <View style={styles.playOverlay}><Play color={colors.surface} size={12} fill={colors.surface} /></View>}
  </View>;
}

const styles = StyleSheet.create({
  frame: { overflow: "hidden", alignItems: "center", justifyContent: "center", backgroundColor: colors.paleGreen },
  playOverlay: { position: "absolute", width: 25, height: 25, borderRadius: 13, alignItems: "center", justifyContent: "center", backgroundColor: "#13251F99" },
});
