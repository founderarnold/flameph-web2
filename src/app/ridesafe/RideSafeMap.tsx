"use client";

import { useEffect, useRef, useState } from "react";
import { importLibrary, setOptions } from "@googlemaps/js-api-loader";

type MapView =
  | { mode: "search"; query: string; point?: [number, number] }
  | { mode: "directions"; destination: string; origin: [number, number] | null; point?: [number, number] };

let loaderConfigured = false;
let mapsReady: Promise<google.maps.MapsLibrary> | null = null;
export async function loadMaps() {
  const key = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
  if (!key) return null;
  if (!loaderConfigured) {
    setOptions({ key, v: "weekly" });
    loaderConfigured = true;
  }
  mapsReady ??= importLibrary("maps") as Promise<google.maps.MapsLibrary>;
  return mapsReady;
}

export default function RideSafeMap({ view, position }: { view: MapView; position: [number, number] | null }) {
  const canvas = useRef<HTMLDivElement>(null);
  const map = useRef<google.maps.Map | null>(null);
  const routeLines = useRef<google.maps.Polyline[]>([]);
  const markers = useRef<google.maps.Marker[]>([]);
  const [status, setStatus] = useState("Loading Google Maps…");
  const [mapLoaded, setMapLoaded] = useState(false);
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
  const fallbackParams = new URLSearchParams({ output: "embed", hl: "en" });
  if (view.mode === "directions") {
    if (view.origin) fallbackParams.set("saddr", `${view.origin[0]},${view.origin[1]}`);
    fallbackParams.set("daddr", view.point ? `${view.point[0]},${view.point[1]}` : view.destination);
  } else fallbackParams.set("q", view.point ? `${view.point[0]},${view.point[1]}` : view.query);

  useEffect(() => {
    let active = true;
    if (!apiKey) { setStatus("Google Maps API key is not configured yet."); return; }
    void loadMaps().then((library) => {
      if (!active || !library || !canvas.current) return;
      const center = view.point
        ? { lat: view.point[0], lng: view.point[1] }
        : position ? { lat: position[0], lng: position[1] } : { lat: 14.5547, lng: 121.0244 };
      map.current = new library.Map(canvas.current, {
        center, zoom: 13, mapTypeControl: false, streetViewControl: false, fullscreenControl: true,
        clickableIcons: true, gestureHandling: "greedy", mapId: "DEMO_MAP_ID",
      });
      setMapLoaded(true);
      setStatus("Google Maps is ready");
    }).catch(() => { if (active) setStatus("Google Maps could not load. Check the API key and enabled APIs."); });
    return () => { active = false; };
    // Initialize once; later map changes are handled below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apiKey]);

  useEffect(() => {
    if (!mapLoaded || !map.current) return;
    if (view.point) map.current.panTo({ lat: view.point[0], lng: view.point[1] });
    routeLines.current.forEach((line) => line.setMap(null));
    routeLines.current = [];
    if (view.mode === "directions") {
      if (!view.origin) {
        map.current.setZoom(14);
        setStatus("Choose My location first to show a driving route.");
        return;
      }
      setStatus("Finding the driving route…");
      void google.maps.importLibrary("routes").then(async (library) => {
        const { Route } = library as google.maps.RoutesLibrary;
        const { routes } = await Route.computeRoutes({
          origin: { lat: view.origin![0], lng: view.origin![1] },
          destination: view.point ? { lat: view.point[0], lng: view.point[1] } : view.destination,
          travelMode: "DRIVING",
          routingPreference: "TRAFFIC_AWARE",
          fields: ["path", "distanceMeters", "durationMillis", "localizedValues", "viewport"],
        });
        const route = routes?.[0];
        if (!route || !map.current) throw new Error("No route returned");
        routeLines.current = route.createPolylines({
          polylineOptions: { map: map.current, strokeColor: "#0f766e", strokeOpacity: 0.95, strokeWeight: 6 },
        });
        if (route.viewport) map.current.fitBounds(route.viewport);
        const values = route.localizedValues;
        setStatus(values?.distance && values.duration
          ? `Driving route · ${values.distance} · ${values.duration}`
          : "Driving route ready");
      }).catch(() => setStatus("No driving route found. Check that Routes API is enabled, then try a nearby destination."));
      return;
    }

    for (const marker of markers.current) marker.setMap(null);
    markers.current = [];
    const term = view.query.trim();
    if (!term) { setStatus("Search a destination or service to get started."); return; }
    setStatus(`Searching Google Maps for ${term}…`);
    void google.maps.importLibrary("places").then(async (placesLibrary) => {
      const places = placesLibrary as google.maps.PlacesLibrary;
      const result = await places.Place.searchByText({
        textQuery: term,
        fields: ["displayName", "location", "formattedAddress", "googleMapsURI"],
        locationBias: map.current?.getBounds() ?? { center: map.current!.getCenter()!, radius: 25000 },
        maxResultCount: 10,
      });
      if (!map.current) return;
      const found = result.places ?? [];
      for (const place of found) {
        if (!place.location) continue;
        markers.current.push(new google.maps.Marker({ map: map.current, position: place.location, title: place.displayName ?? term }));
      }
      if (found.length) {
        const bounds = new google.maps.LatLngBounds();
        found.forEach((place) => place.location && bounds.extend(place.location));
        map.current.fitBounds(bounds);
        setStatus(`${found.length} Google Maps results for ${term}`);
      } else setStatus(`No nearby Google Maps results for ${term}. Try another search.`);
    }).catch(() => setStatus("Could not search nearby places. Please try again."));
  }, [mapLoaded, view, position]);

  if (!apiKey) return <div className="ridesafe-map-wrap map-unconfigured"><iframe className="ridesafe-google-map ridesafe-map-fallback" src={`https://www.google.com/maps?${fallbackParams.toString()}`} title="Google Maps fallback preview" loading="lazy" referrerPolicy="strict-origin-when-cross-origin" /><div className="map-setup-card"><span className="setup-icon">⌖</span><strong>Interactive map setup needed</strong><p>The current map preview still works. Add <code>NEXT_PUBLIC_GOOGLE_MAPS_API_KEY</code> in Vercel with website restrictions for <code>flameph.org</code>, and enable Maps JavaScript API, Places API (New), and Routes API to turn on live suggestions, nearby results, and in-page driving routes.</p><a href="https://developers.google.com/maps/documentation/javascript/get-api-key" target="_blank" rel="noreferrer">Google Maps setup guide ↗</a></div></div>;

  return <div className="ridesafe-map-wrap">
    <div ref={canvas} className="ridesafe-google-map" aria-label="Interactive Google map" />
    <div className="map-status" role="status"><span className={mapLoaded ? "live-dot" : ""} />{status}</div>
  </div>;
}
