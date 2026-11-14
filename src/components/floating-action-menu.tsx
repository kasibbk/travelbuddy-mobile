import { useEffect, useState } from "react";
import { Animated, Pressable, StyleSheet, View } from "react-native";
import { Bike, MapPin, MessageCircle, Plus } from "lucide-react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { CreateRideModal } from "./create-ride-modal";
import { colors } from "./theme";
import type { RideCardData } from "../lib/app-data";

type FloatingActionMenuProps = {
  onRideCreated?: (ride: RideCardData) => void;
};

const MAIN_SIZE = 58;
const ACTION_SIZE = 46;
const RADIUS = 92;

export function FloatingActionMenu({ onRideCreated }: FloatingActionMenuProps) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [expanded, setExpanded] = useState(false);
  const [createRideVisible, setCreateRideVisible] = useState(false);
  const [progress] = useState(() => new Animated.Value(0));
  const actions = [
    { label: "New ride", icon: Bike, onPress: () => setCreateRideVisible(true) },
    { label: "New chat", icon: MessageCircle, onPress: () => router.push({ pathname: "/(tabs)/friends", params: { tab: "Friends" } }) },
    { label: "Friends map", icon: MapPin, onPress: () => router.push("/friends-map") },
  ];

  useEffect(() => {
    Animated.spring(progress, {
    toValue: expanded ? 1 : 0,
    useNativeDriver: true,
    friction: 7,
    tension: 65,
    }).start();
  }, [expanded, progress]);

  return <View pointerEvents="box-none" style={StyleSheet.absoluteFill}>
    {expanded && <Pressable accessibilityLabel="Close actions menu" onPress={() => setExpanded(false)} style={styles.backdrop} />}
    {actions.map((action, index) => {
    const angle = -90 - (90 * index) / (actions.length - 1);
    const radians = (angle * Math.PI) / 180;
    const x = Math.cos(radians) * RADIUS;
    const y = -Math.sin(radians) * RADIUS;
    const opacity = progress;
    const scale = progress.interpolate({ inputRange: [0, 1], outputRange: [0.55, 1] });
      const translateX = progress.interpolate({ inputRange: [0, 1], outputRange: [-x, 0] });
      const translateY = progress.interpolate({ inputRange: [0, 1], outputRange: [y, 0] });
      const Icon = action.icon;
      return <Animated.View key={action.label} pointerEvents={expanded ? "auto" : "none"} style={[
        styles.actionPosition,
        { right: 49 - x - ACTION_SIZE / 2, bottom: Math.max(12, insets.bottom) + 41 - ACTION_SIZE / 2 + y },
        { opacity, transform: [{ translateX }, { translateY }, { scale }] },
      ]}>
        <Pressable accessibilityRole="button" accessibilityLabel={action.label} onPress={() => { setExpanded(false); action.onPress(); }} style={styles.actionButton}>
          <Icon color={colors.forest} size={19} />
        </Pressable>
      </Animated.View>;
    })}
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={expanded ? "Close actions menu" : "Open actions menu"}
      accessibilityState={{ expanded }}
      onPress={() => setExpanded((value) => !value)}
      style={[styles.mainButton, { right: 20, bottom: Math.max(12, insets.bottom) + 12 }]}
    >
      <Animated.View style={{ transform: [{ rotate: progress.interpolate({ inputRange: [0, 1], outputRange: ["0deg", "45deg"] }) }] }}>
        <Plus color={colors.surface} size={25} strokeWidth={2.5} />
      </Animated.View>
    </Pressable>
    <CreateRideModal
      visible={createRideVisible}
      onClose={() => setCreateRideVisible(false)}
      onOpen={() => setCreateRideVisible(true)}
      onCreated={(ride) => {
        if (onRideCreated) onRideCreated(ride);
        else router.push({ pathname: "/rides/[id]", params: { id: ride.id } });
      }}
    />
  </View>;
}

const styles = StyleSheet.create({
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: "#193A3210" },
  actionPosition: { position: "absolute", width: ACTION_SIZE, height: ACTION_SIZE, alignItems: "center", justifyContent: "center" },
  actionButton: { width: ACTION_SIZE, height: ACTION_SIZE, borderRadius: ACTION_SIZE / 2, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface, elevation: 5, shadowColor: "#193A32", shadowOpacity: 0.16, shadowRadius: 8, shadowOffset: { width: 0, height: 3 } },
  mainButton: { position: "absolute", width: MAIN_SIZE, height: MAIN_SIZE, borderRadius: MAIN_SIZE / 2, alignItems: "center", justifyContent: "center", backgroundColor: colors.forest, elevation: 7, shadowColor: "#193A32", shadowOpacity: 0.25, shadowRadius: 9, shadowOffset: { width: 0, height: 4 } },
});
