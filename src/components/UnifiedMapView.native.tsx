import { useContext, useEffect, useMemo, useRef, useState } from "react";
import { Linking, Pressable, StyleProp, StyleSheet, Text, View, ViewStyle } from "react-native";
import MapView, { Marker, Polyline, PROVIDER_GOOGLE, Region } from "react-native-maps";
import { Camera, GeoJSONSource, Layer, Map as MapLibreMap } from "@maplibre/maplibre-react-native";
import type { CameraRef, MapRef } from "@maplibre/maplibre-react-native";
import { PageScrollLockContext } from "./page-shell";
import type { AppCoords } from "../services/location/types";
import { USE_GOOGLE_MAPS } from "../services/location";

const OPENFREEMAP_STYLE = "https://tiles.openfreemap.org/styles/liberty";
const EMPTY_FRIEND_MARKERS: { id: string; location: AppCoords; title: string }[] = [];
const DEFAULT_REGION: Region = {
  latitude: 20,
  longitude: 0,
  latitudeDelta: 120,
  longitudeDelta: 120,
};

type UnifiedMapViewProps = {
  userLocation: AppCoords | null;
  currentLocation?: AppCoords | null;
  currentLocationTitle?: string;
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
  onFriendMarkerPress?: (friendId: string) => void;
  routeProgress?: number | null;
  cameraCommand?: { id: number; action: "center" | "zoom-in" | "zoom-out" | "overview" | "north"; target?: AppCoords; bearing?: number; zoom?: number; pitch?: number } | null;
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

function zoomFromLongitudeDelta(longitudeDelta: number) {
  return Math.max(2, Math.min(19, Math.log2(360 / Math.max(longitudeDelta, 0.00001))));
}

function splitRouteAtProgress(points: AppCoords[], progress: number) {
  if (progress <= 0) return { travelled: [], remaining: points };
  if (progress >= 1) return { travelled: points, remaining: [] };

  const segmentDistances = points.slice(1).map((point, index) => {
    const previous = points[index];
    const latitudeDelta = (point.lat - previous.lat) * Math.PI / 180;
    const longitudeDelta = (point.lng - previous.lng) * Math.PI / 180;
    const haversine = Math.sin(latitudeDelta / 2) ** 2
      + Math.cos(previous.lat * Math.PI / 180) * Math.cos(point.lat * Math.PI / 180) * Math.sin(longitudeDelta / 2) ** 2;
    return 2 * 6_371_000 * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine));
  });
  const totalDistance = segmentDistances.reduce((total, distance) => total + distance, 0);
  if (totalDistance <= 0) return { travelled: [], remaining: points };

  const targetDistance = totalDistance * progress;
  let travelledDistance = 0;
  for (let index = 0; index < segmentDistances.length; index += 1) {
    const segmentDistance = segmentDistances[index];
    if (travelledDistance + segmentDistance >= targetDistance) {
      const ratio = segmentDistance > 0 ? (targetDistance - travelledDistance) / segmentDistance : 0;
      const start = points[index];
      const end = points[index + 1];
      const split = {
        lat: start.lat + (end.lat - start.lat) * ratio,
        lng: start.lng + (end.lng - start.lng) * ratio,
      };
      return {
        travelled: [...points.slice(0, index + 1), split],
        remaining: [split, ...points.slice(index + 1)],
      };
    }
    travelledDistance += segmentDistance;
  }
  return { travelled: points, remaining: [] };
}

export function UnifiedMapView({ userLocation, currentLocation = null, currentLocationTitle = "You", destinationLocation, routePoints, friendMarkers = EMPTY_FRIEND_MARKERS, style, selectionMode = false, readOnly = false, fitToMarkers = false, showUserLocationTitle = false, userLocationTitle = "You", destinationTitle = "Destination", cameraTarget, onLocationSelect, onMapPress, onFriendMarkerPress, routeProgress, cameraCommand }: UnifiedMapViewProps) {
  const setPageScrollLocked = useContext(PageScrollLockContext);
  useEffect(() => () => setPageScrollLocked?.(false), [setPageScrollLocked]);
  const center = selectionMode ? cameraTarget ?? userLocation : centerCoords(userLocation, destinationLocation) ?? currentLocation ?? friendMarkers[0]?.location ?? null;
  const markerIds = friendMarkers.map(({ id }) => id).sort().join(",");
  const mapKey = selectionMode
    ? `picker-${center?.lat ?? "default"}-${center?.lng ?? "default"}`
    : fitToMarkers
      ? `fit-${Boolean(userLocation)}-${markerIds || "none"}`
      : centerCoords(userLocation, destinationLocation)
        ? `${center?.lat}:${center?.lng}`
        : `friends-${markerIds || "none"}`;
  const viewportPoints = useMemo(() => [
    ...routePoints,
    ...(userLocation ? [userLocation] : []),
    ...(currentLocation ? [currentLocation] : []),
    ...(destinationLocation ? [destinationLocation] : []),
    ...friendMarkers.map(({ location }) => location),
  ], [currentLocation, destinationLocation, friendMarkers, routePoints, userLocation]);
  const routeViewport = useMemo(() => readOnly || fitToMarkers ? routeBounds(viewportPoints) : null, [fitToMarkers, readOnly, viewportPoints]);
  const mapRef = useRef<MapView>(null);
  const mapLibreRef = useRef<MapRef>(null);
  const cameraRef = useRef<CameraRef>(null);
  const lastCameraCommandId = useRef<number | null>(null);
  const googleZoom = useRef(12);
  const [mapReady, setMapReady] = useState(false);
  const region: Region = routeViewport?.region ?? (center
    ? { latitude: center.lat, longitude: center.lng, latitudeDelta: 0.15, longitudeDelta: 0.15 }
    : DEFAULT_REGION);
  const routeData = useMemo<GeoJSON.FeatureCollection<GeoJSON.LineString>>(() => {
    if (routePoints.length < 2) return { type: "FeatureCollection", features: [] };
    const segments = routeProgress === null || routeProgress === undefined
      ? [{ segment: "full", points: routePoints }]
      : (() => {
        const split = splitRouteAtProgress(routePoints, Math.max(0, Math.min(1, routeProgress)));
        return [
          { segment: "travelled", points: split.travelled },
          { segment: "remaining", points: split.remaining },
        ].filter((item) => item.points.length >= 2);
      })();
    return {
      type: "FeatureCollection",
      features: segments.map(({ segment, points }) => ({
        type: "Feature",
        properties: { segment },
        geometry: { type: "LineString", coordinates: points.map(({ lat, lng }) => [lng, lat]) },
      })),
    };
  }, [routePoints, routeProgress]);
  const markerData = useMemo<GeoJSON.FeatureCollection<GeoJSON.Point>>(() => ({
    type: "FeatureCollection",
    features: [
      ...(userLocation ? [{
        type: "Feature" as const,
        properties: showUserLocationTitle ? { kind: "self", title: userLocationTitle } : { kind: "start" },
        geometry: { type: "Point" as const, coordinates: [userLocation.lng, userLocation.lat] as [number, number] },
      }] : []),
      ...(currentLocation ? [{
        type: "Feature" as const,
        properties: { kind: "current", title: currentLocationTitle },
        geometry: { type: "Point" as const, coordinates: [currentLocation.lng, currentLocation.lat] as [number, number] },
      }] : []),
      ...(destinationLocation ? [{
        type: "Feature" as const,
        properties: { kind: "destination" },
        geometry: { type: "Point" as const, coordinates: [destinationLocation.lng, destinationLocation.lat] as [number, number] },
      }] : []),
      ...friendMarkers.map((friend) => ({
        type: "Feature" as const,
        properties: { kind: "friend", title: friend.title, friendId: friend.id },
        geometry: { type: "Point" as const, coordinates: [friend.location.lng, friend.location.lat] as [number, number] },
      })),
    ],
  }), [userLocation, currentLocation, currentLocationTitle, destinationLocation, friendMarkers, showUserLocationTitle, userLocationTitle]);

  useEffect(() => {
    if (!cameraCommand || !mapReady || lastCameraCommandId.current === cameraCommand.id) return;
    const action = cameraCommand.action;
    const centerTarget = cameraCommand.target ?? currentLocation ?? userLocation;
    if (USE_GOOGLE_MAPS) {
      const map = mapRef.current;
      if (!map) return;
      lastCameraCommandId.current = cameraCommand.id;
      if (action === "center" && centerTarget) {
        map.animateCamera({
          center: { latitude: centerTarget.lat, longitude: centerTarget.lng },
          ...(cameraCommand.bearing !== undefined ? { heading: cameraCommand.bearing } : {}),
          ...(cameraCommand.zoom !== undefined ? { zoom: cameraCommand.zoom } : {}),
          ...(cameraCommand.pitch !== undefined ? { pitch: cameraCommand.pitch } : {}),
        }, { duration: 650 });
      } else if (action === "overview" && viewportPoints.length >= 2) {
        map.fitToCoordinates(viewportPoints.map(({ lat, lng }) => ({ latitude: lat, longitude: lng })), {
          edgePadding: { top: 100, right: 80, bottom: 210, left: 40 },
          animated: true,
        });
      } else if (action === "north") {
        map.animateCamera({ heading: 0, pitch: 0 }, { duration: 300 });
      } else if (action === "zoom-in" || action === "zoom-out") {
        googleZoom.current = Math.max(2, Math.min(19, googleZoom.current + (action === "zoom-in" ? 1 : -1)));
        map.animateCamera({ zoom: googleZoom.current }, { duration: 250 });
      }
      return;
    }

    const map = mapLibreRef.current;
    const camera = cameraRef.current;
    if (!map || !camera) return;
    lastCameraCommandId.current = cameraCommand.id;
    if (action === "center" && centerTarget) {
      camera.easeTo({
        center: [centerTarget.lng, centerTarget.lat],
        ...(cameraCommand.bearing !== undefined ? { bearing: cameraCommand.bearing } : {}),
        ...(cameraCommand.zoom !== undefined ? { zoom: cameraCommand.zoom } : {}),
        ...(cameraCommand.pitch !== undefined ? { pitch: cameraCommand.pitch } : {}),
        duration: 650,
      });
    } else if (action === "overview" && routeViewport) {
      camera.fitBounds(routeViewport.bounds, {
        padding: { top: 100, right: 80, bottom: 210, left: 40 },
        duration: 450,
      });
    } else if (action === "north") {
      void map.getCenter()
        .then((currentCenter) => camera.easeTo({ center: currentCenter, bearing: 0, pitch: 0, duration: 300 }))
        .catch((error: unknown) => console.warn("[map] Could not reset map orientation", error));
    } else if (action === "zoom-in" || action === "zoom-out") {
      void map.getZoom()
        .then((zoom) => camera.zoomTo(Math.max(2, Math.min(19, zoom + (action === "zoom-in" ? 1 : -1))), { duration: 250 }))
        .catch((error: unknown) => console.warn("[map] Could not read the current map zoom", error));
    }
  }, [cameraCommand, currentLocation, mapReady, routeViewport, userLocation, viewportPoints]);

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
        setMapReady(true);
        googleZoom.current = zoomFromLongitudeDelta(region.longitudeDelta);
        if ((readOnly || fitToMarkers) && viewportPoints.length >= 2) {
          mapRef.current?.fitToCoordinates(viewportPoints.map(({ lat, lng }) => ({ latitude: lat, longitude: lng })), {
            edgePadding: { top: 28, right: 28, bottom: 28, left: 28 },
            animated: false,
          });
        }
      }} onRegionChangeComplete={(nextRegion) => { googleZoom.current = zoomFromLongitudeDelta(nextRegion.longitudeDelta); }} onPress={selectionMode ? (event) => onLocationSelect?.({ lat: event.nativeEvent.coordinate.latitude, lng: event.nativeEvent.coordinate.longitude }) : onMapPress ? () => onMapPress() : undefined}>
        {userLocation && <Marker coordinate={{ latitude: userLocation.lat, longitude: userLocation.lng }} title={userLocationTitle} />}
        {currentLocation && <Marker coordinate={{ latitude: currentLocation.lat, longitude: currentLocation.lng }} title={currentLocationTitle} pinColor="#276EF1" />}
        {destinationLocation && <Marker coordinate={{ latitude: destinationLocation.lat, longitude: destinationLocation.lng }} title={destinationTitle} />}
        {routePoints.length >= 2 && routeProgress !== null && routeProgress !== undefined
          ? (() => {
            const split = splitRouteAtProgress(routePoints, Math.max(0, Math.min(1, routeProgress)));
            return <>
              {split.remaining.length >= 2 && <Polyline coordinates={split.remaining.map(({ lat, lng }) => ({ latitude: lat, longitude: lng }))} strokeColor="#214E3D" strokeWidth={5} />}
              {split.travelled.length >= 2 && <Polyline coordinates={split.travelled.map(({ lat, lng }) => ({ latitude: lat, longitude: lng }))} strokeColor="#89968E" strokeWidth={5} />}
            </>;
          })()
          : routePoints.length >= 2 && <Polyline coordinates={routePoints.map(({ lat, lng }) => ({ latitude: lat, longitude: lng }))} strokeColor="#214E3D" strokeWidth={4} />}
        {friendMarkers.map((friend) => <Marker key={friend.id} coordinate={{ latitude: friend.location.lat, longitude: friend.location.lng }} title={friend.title} onPress={() => onFriendMarkerPress?.(friend.id)} />)}
      </MapView>
      : <MapLibreMap ref={mapLibreRef} key={`open-${mapKey}`} mapStyle={OPENFREEMAP_STYLE} style={StyleSheet.absoluteFill} pointerEvents={readOnly ? "none" : "auto"} onDidFinishLoadingMap={() => setMapReady(true)} onPress={selectionMode ? (event) => {
        const [lng, lat] = event.nativeEvent.lngLat;
        onLocationSelect?.({ lat, lng });
      } : onMapPress ? () => onMapPress() : undefined}>
        <Camera ref={cameraRef} initialViewState={routeViewport ? { bounds: routeViewport.bounds, padding: { top: 28, right: 28, bottom: 28, left: 28 } } : { center: center ? [center.lng, center.lat] : [0, 20], zoom: center ? 10 : 2 }} />
        <GeoJSONSource id="route-source" data={routeData}>
          <Layer id="route-line-remaining" type="line" source="route-source" filter={["==", ["get", "segment"], "remaining"]} layout={{ "line-cap": "round", "line-join": "round" }} paint={{ "line-color": "#214E3D", "line-width": 5 }} />
          <Layer id="route-line-travelled" type="line" source="route-source" filter={["==", ["get", "segment"], "travelled"]} layout={{ "line-cap": "round", "line-join": "round" }} paint={{ "line-color": "#89968E", "line-width": 5 }} />
          <Layer id="route-line-full" type="line" source="route-source" filter={["==", ["get", "segment"], "full"]} layout={{ "line-cap": "round", "line-join": "round" }} paint={{ "line-color": "#214E3D", "line-width": 4 }} />
        </GeoJSONSource>
        <GeoJSONSource id="location-markers" data={markerData} hitbox={{ top: 12, right: 12, bottom: 12, left: 12 }} onPress={(event) => {
          const feature = event.nativeEvent.features.find((item) => item.properties?.kind === "friend");
          const friendId = feature?.properties?.friendId;
          if (typeof friendId === "string") onFriendMarkerPress?.(friendId);
        }}>
          <Layer id="location-circles" type="circle" source="location-markers" paint={{ "circle-radius": 7, "circle-color": ["match", ["get", "kind"], "friend", "#214E3D", "current", "#276EF1", "#DF8054"], "circle-stroke-color": "#FFFFFF", "circle-stroke-width": 2 }} />
          <Layer id="friend-labels" type="symbol" source="location-markers" filter={["==", ["get", "kind"], "friend"]} layout={{ "text-field": ["get", "title"], "text-font": ["Noto Sans Regular"], "text-size": 11, "text-offset": [0, 1.3], "text-anchor": "top", "text-allow-overlap": true }} paint={{ "text-color": "#193A32", "text-halo-color": "#FFFFFF", "text-halo-width": 1 }} />
          {showUserLocationTitle && <Layer id="self-label" type="symbol" source="location-markers" filter={["==", ["get", "kind"], "self"]} layout={{ "text-field": ["get", "title"], "text-font": ["Noto Sans Regular"], "text-size": 11, "text-offset": [0, 1.3], "text-anchor": "top", "text-allow-overlap": true }} paint={{ "text-color": "#193A32", "text-halo-color": "#FFFFFF", "text-halo-width": 1 }} />}
          {currentLocation && <Layer id="current-location-label" type="symbol" source="location-markers" filter={["==", ["get", "kind"], "current"]} layout={{ "text-field": ["get", "title"], "text-font": ["Noto Sans Regular"], "text-size": 11, "text-offset": [0, 1.3], "text-anchor": "top", "text-allow-overlap": true }} paint={{ "text-color": "#193A32", "text-halo-color": "#FFFFFF", "text-halo-width": 1 }} />}
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
