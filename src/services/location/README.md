# Location provider setup

`USE_GOOGLE_MAPS` in `index.ts` is the single provider switch used by routing/geocoding and the native map wrapper. Keep it `false` for the open-source MVP provider. Set it to `true` to use Google services and the Google map provider.

Ride start and destination locations are selected on the map. The selected coordinates are reverse-geocoded into the ride's existing location label; the ride data model remains label-based. Nominatim reverse-geocoding requests are made only when the user confirms a pin.

Ride details geocode the saved start/destination labels, calculate a motor-vehicle route, distance in kilometers, estimated travel time, and turn-by-turn steps through the selected provider. Tapping the route preview or a ride-card map icon opens the fitted full-screen route map; its directions button opens the step list. Route previews are calculated when opened and are not persisted.

The map picker and profile home-location field provide explicit location searches with selectable results. Searches are submitted by the user and are not autocomplete requests.

Nearby discovery and live friend sharing use one background live-location stream, with independent preferences. Nearby discovery controls whether a rider appears in Nearby and exposes only approximate distance; the friend-sharing preference controls exact map visibility. A stream runs while either preference is enabled and stops, clearing the stored location, when both are off. Sharing is visible only between active, accepted friends with no block in either direction when both have sharing enabled. Locations older than five minutes are hidden and purged on later location updates or map refreshes. The Friends map listens for realtime inserts/updates and refreshes periodically so expired locations disappear even when realtime is unavailable. Sign-out stops tracking and clears the current location without changing either preference; tracking resumes after sign-in when a preference is enabled and permissions remain available. Operating-system force-stops or revoked permissions can interrupt updates. Apply the live-location database migrations and rebuild the native app to add the background location permissions and foreground-service configuration.

For Google, provide:

- `EXPO_PUBLIC_GOOGLE_MAPS_API_KEY` for the Google Distance Matrix, Directions, and Geocoding web service requests.
- `GOOGLE_MAPS_ANDROID_API_KEY` and `GOOGLE_MAPS_IOS_API_KEY` for the native map SDKs. These are read by `app.config.js` when creating native projects.

The public REST key is included in the client bundle. Use an API-restricted key and do not commit it. Google Maps Platform requires an enabled billing account; usage may incur charges. Rebuild the native app after adding or changing native SDK keys.

The default motor-vehicle router is the public FOSSGIS OSRM car service; forward and reverse geocoding use the public Nominatim service and map tiles/styles use OpenFreeMap. These public services are community-operated, best-effort services, not a production SLA. Requests are locally spaced to respect the one-request-per-second guidance; this does not coordinate rate limits across app installations. Do not use Nominatim for autocomplete or high-volume geocoding. Keep OpenStreetMap/OpenFreeMap attribution visible and follow their current usage policies before launch.
