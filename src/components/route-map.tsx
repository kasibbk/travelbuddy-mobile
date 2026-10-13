import Svg, { Circle, Path, Text as SvgText } from "react-native-svg";
import { StyleSheet, View } from "react-native";

export function RouteMap({ compact = false }: { compact?: boolean }) {
  return (
    <View style={[styles.map, compact && styles.compact]}>
      <Svg viewBox="0 0 360 210" width="100%" height="100%">
        <Path d="M-8 27 49 13l33 22 43-12 39 29 48-14 31 21 43-5 42 26 39-11 21 14M-12 91l55-17 39 27 45-21 38 34 46-26 45 19 35-9 37 31 46-20M-5 166l62-36 44 19 37-27 41 35 39-16 45 34 43-13 42 24 33-10M27 214l35-39 53 13 26-30 57 25 34-31 35 31 39-16 31 20" fill="none" stroke="#FFFFFF" strokeWidth="2" />
        <Path d="M101 176c25-10 20-50 49-50s25 32 50 11 27-43 48-28 7 39 32 34 18-28 39-22" fill="none" stroke="#DB7950" strokeWidth="4" strokeLinecap="round" strokeDasharray="7 5" />
        <Circle cx="101" cy="176" r="7" fill="#FFFFFF" stroke="#DB7950" strokeWidth="4" />
        <Circle cx="319" cy="121" r="7" fill="#FFFFFF" stroke="#DB7950" strokeWidth="4" />
        {!compact && <><SvgText x="74" y="199" fontSize="8" fontWeight="700" fill="#315247">SAN FRANCISCO</SvgText><SvgText x="262" y="105" fontSize="8" fontWeight="700" fill="#315247">HALF MOON BAY</SvgText></>}
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  map: { height: 154, overflow: "hidden", borderRadius: 12, backgroundColor: "#DCE7D4", padding: 4 },
  compact: { height: 80, width: 100, borderRadius: 8 },
});