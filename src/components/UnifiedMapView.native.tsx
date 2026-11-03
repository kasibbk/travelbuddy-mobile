import { useContext, useEffect, useMemo, useRef } from "react";
import { Linking, Pressable, StyleProp, StyleSheet, Text, View, ViewStyle } from "react-native";
import MapView, { Marker, Polyline, PROVIDER_GOOGLE, Region } from "react-native-maps";
import { Camera, GeoJSONSource, Layer, Map as MapLibreMap } from "@maplibre/maplibre-react-native";
import { PageScrollLockContext } from "./page-shell";
import type { AppCoords } from "../services/location/types";
import { USE_GOOGLE_MAPS } from "../services/location";

const OPENFREEMAP_STYLE = "https://tiles.openfreemap.org/styles/liberty";
const DEFAULT_REGION: Region = {
  latitude: 20,
  longitude: 0,
  latitudeDelta: 120,
  longitudeDelta: 120,
};

type UnifiedMapViewProps = {
  userLocation: AppCoords | null;
  destinationLocation: AppCoords | null;
  routePoints: AppCoords[];
  friendMarkers?: { id: string; location: AppCoords; title: string }[];
  style?: StyleProp<ViewStyle>;
  selectionMode?: boolean;
  readOnly?: boolean;
  fitToMarkers?: boolean;
  showUserLocationTitle?: boolean;
  userLocationTitle?: string;
  destinationTitle?: string;
  cameraTarget?: AppCoords | null;
  selectedLocation?: AppCoords | null;
  onLocationSelect?: (location: AppCoords) => void;
  onMapPress?: () => void;
};

function routeBounds(points: AppCoords[]) {
  if (points.length < 2) return null;
  const longitudes = points.map(({ lng }) => lng);
  const latitudes = points.map(({ lat }) => lat);
  const west = Math.min(...longitudes);
  const east = Math.max(...longitudes);
  const south = Math.min(...latitudes);
  const north = Math.max(...latitudes);
  const longitudePadding = Math.max((east - west) * 0.08, 0.002);
  const latitudePadding = Math.max((north - south) * 0.08, 0.002);
  return {
    bounds: [west - longitudePadding, south - latitudePadding, east + longitudePadding, north + latitudePadding] as [number, number, number, number],
    region: {
      latitude: (south + north) / 2,
      longitude: (west + east) / 2,
      latitudeDelta: Math.min(180, Math.max((north - south) * 1.35, 0.01)),
      longitudeDelta: Math.min(360, Math.max((east - west) * 1.35, 0.01)),
    } as Region,
  };
}

function centerCoords(userLocation: AppCoords | null, destinationLocation: AppCoords | null): AppCoords | null {
  if (userLocation && destinationLocation) {
    return { lat: (userLocation.lat + destinationLocation.lat) / 2, lng: (userLocation.lng + destinationLocation.lng) / 2 };
  }
  return userLocation ?? destinationLocation;
}

export function UnifiedMapView({ userLocation, destinationLocation, routePoints, friendMarkers = [], style, selectionMode = false, readOnly = false, fitToMarkers = false, showUserLocationTitle = false, userLocationTitle = "You", destinationTitle = "Destination", cameraTarget, onLocationSelect, onMapPress }: UnifiedMapViewProps) {
  const setPageScrollLocked = useContext(PageScrollLockContext);
  useEffect(() => () => setPageScrollLocked?.(false), [setPageScrollLocked]);
  const center = selectionMode ? cameraTarget ?? userLocation : centerCoords(userLocation, destinationLocation) ?? friendMarkers[0]?.location ?? null;
  const markerIds = friendMarkers.map(({ id }) => id).sort().join(",");
  const mapKey = selectionMode
    ? `picker-${center?.lat ?? "default"}-${center?.lng ?? "default"}`
    : fitToMarkers
      ? `fit-${Boolean(userLocation)}-${markerIds || "none"}`
      : centerCoords(userLocation, destinationLocation)
        ? `${center?.lat}:${center?.lng}`
        : `friends-${markerIds || "none"}`;
  const viewportPoints = [
    ...routePoints,
    ...(userLocation ? [userLocation] : []),
    ...(destinationLocation ? [destinationLocation] : []),
    ...friendMarkers.map(({ location }) => location),
  ];
  const routeViewport = readOnly || fitToMarkers ? routeBounds(viewportPoints) : null;
  const mapRef = useRef<MapView>(null);
  const region: Region = routeViewport?.region ?? (center
    ? { latitude: center.lat, longitude: center.lng, latitudeDelta: 0.15, longitudeDelta: 0.15 }
    : DEFAULT_REGION);
  const routeData = useMemo<GeoJSON.FeatureCollection<GeoJSON.LineString>>(() => ({
    type: "FeatureCollection",
    features: routePoints.length >= 2 ? [{
      type: "Feature",
      properties: {},
      geometry: { type: "LineString", coordinates: routePoints.map(({ lat, lng }) => [lng, lat]) },
    }] : [],
  }), [routePoints]);
  const markerData = useMemo<GeoJSON.FeatureCollection<GeoJSON.Point>>(() => ({
    type: "FeatureCollection",
    features: [
      ...(userLocation ? [{
        type: "Feature" as const,
        properties: showUserLocationTitle ? { kind: "self", title: userLocationTitle } : { kind: "start" },
        geometry: { type: "Point" as const, coordinates: [userLocation.lng, userLocation.lat] as [number, number] },
      }] : []),
      ...(destinationLocation ? [{
        type: "Feature" as const,
        properties: { kind: "destination" },
        geometry: { type: "Point" as const, coordinates: [destinationLocation.lng, destinationLocation.lat] as [number, number] },
      }] : []),
      ...friendMarkers.map((friend) => ({
        type: "Feature" as const,
        properties: { kind: "friend", title: friend.title },
        geometry: { type: "Point" as const, coordinates: [friend.location.lng, friend.location.lat] as [number, number] },
      })),
    ],
  }), [userLocation, destinationLocation, friendMarkers, showUserLocationTitle, userLocationTitle]);

  return <View
    style={[styles.container, selectionMode && styles.selectionContainer, style]}
    onTouchStartCapture={(event) => {
      if (!readOnly && event.nativeEvent.touches.length === 1) setPageScrollLocked?.(true);
    }}
    onTouchEndCapture={(event) => {
      if (!readOnly && event.nativeEvent.touches.length === 0) setPageScrollLocked?.(false);
    }}
    onTouchCancelCapture={() => {
      if (!readOnly) setPageScrollLocked?.(false);
    }}
  >
    {USE_GOOGLE_MAPS
      ? <MapView ref={mapRef} key={`google-${mapKey}`} provider={PROVIDER_GOOGLE} style={StyleSheet.absoluteFill} initialRegion={region} pointerEvents={readOnly ? "none" : "auto"} scrollEnabled={!readOnly} zoomEnabled={!readOnly} rotateEnabled={!readOnly} pitchEnabled={!readOnly} toolbarEnabled={!readOnly} onMapReady={() => {
        if ((readOnly || fitToMarkers) && viewportPoints.length >= 2) {
          mapRef.current?.fitToCoordinates(viewportPoints.map(({ lat, lng }) => ({ latitude: lat, longitude: lng })), {
            edgePadding: { top: 28, right: 28, bottom: 28, left: 28 },
            animated: false,
          });
        }
      }} onPress={selectionMode ? (event) => onLocationSelect?.({ lat: event.nativeEvent.coordinate.latitude, lng: event.nativeEvent.coordinate.longitude }) : onMapPress ? () => onMapPress() : undefined}>
        {userLocation && <Marker coordinate={{ latitude: userLocation.lat, longitude: userLocation.lng }} title={userLocationTitle} />}
        {destinationLocation && <Marker coordinate={{ latitude: destinationLocation.lat, longitude: destinationLocation.lng }} title={destinationTitle} />}
        {routePoints.length >= 2 && <Polyline coordinates={routePoints.map(({ lat, lng }) => ({ latitude: lat, longitude: lng }))} strokeColor="#214E3D" strokeWidth={4} />}
        {friendMarkers.map((friend) => <Marker key={friend.id} coordinate={{ latitude: friend.location.lat, longitude: friend.location.lng }} title={friend.title} />)}
      </MapView>
      : <MapLibreMap key={`open-${mapKey}`} mapStyle={OPENFREEMAP_STYLE} style={StyleSheet.absoluteFill} pointerEvents={readOnly ? "none" : "auto"} onPress={selectionMode ? (event) => {
        const [lng, lat] = event.nativeEvent.lngLat;
        onLocationSelect?.({ lat, lng });
      } : onMapPress ? () => onMapPress() : undefined}>
        <Camera initialViewState={routeViewport ? { bounds: routeViewport.bounds, padding: { top: 28, right: 28, bottom: 28, left: 28 } } : { center: center ? [center.lng, center.lat] : [0, 20], zoom: center ? 10 : 2 }} />
        <GeoJSONSource id="route-source" data={routeData}>
          <Layer id="route-line" type="line" source="route-source" layout={{ "line-cap": "round", "line-join": "round" }} paint={{ "line-color": "#214E3D", "line-width": 4 }} />
        </GeoJSONSource>
        <GeoJSONSource id="location-markers" data={markerData}>
          <Layer id="location-circles" type="circle" source="location-markers" paint={{ "circle-radius": 7, "circle-color": ["match", ["get", "kind"], "friend", "#214E3D", "#DF8054"], "circle-stroke-color": "#FFFFFF", "circle-stroke-width": 2 }} />
          <Layer id="friend-labels" type="symbol" source="location-markers" filter={["==", ["get", "kind"], "friend"]} layout={{ "text-field": ["get", "title"], "text-font": ["Noto Sans Regular"], "text-size": 11, "text-offset": [0, 1.3], "text-anchor": "top", "text-allow-overlap": true }} paint={{ "text-color": "#193A32", "text-halo-color": "#FFFFFF", "text-halo-width": 1 }} />
          {showUserLocationTitle && <Layer id="self-label" type="symbol" source="location-markers" filter={["==", ["get", "kind"], "self"]} layout={{ "text-field": ["get", "title"], "text-font": ["Noto Sans Regular"], "text-size": 11, "text-offset": [0, 1.3], "text-anchor": "top", "text-allow-overlap": true }} paint={{ "text-color": "#193A32", "text-halo-color": "#FFFFFF", "text-halo-width": 1 }} />}
        </GeoJSONSource>
      </MapLibreMap>}
    {!USE_GOOGLE_MAPS && <Pressable accessibilityRole="link" onPress={() => {
      void Linking.openURL("https://www.openstreetmap.org/fixthemap")
        .catch((error: unknown) => console.warn("[map] Could not open OpenStreetMap attribution link", error));
    }} style={styles.attribution}>
      <Text style={styles.attributionText}>© OpenStreetMap contributors · OpenFreeMap</Text>
    </Pressable>}
  </View>;
}

const styles = StyleSheet.create({
  container: { height: 320, minHeight: 200, overflow: "hidden", borderRadius: 12, backgroundColor: "#E8EDDF" },
  selectionContainer: { height: undefined, flex: 1, borderRadius: 0 },
  attribution: { position: "absolute", right: 6, bottom: 5, paddingHorizontal: 6, paddingVertical: 3, borderRadius: 4, backgroundColor: "rgba(255,255,255,0.9)" },
  attributionText: { color: "#193A32", fontSize: 7 },
});
