"use client";

import { useEffect, useRef, useState } from "react";
import { importLibrary, setOptions } from "@googlemaps/js-api-loader";

type MapView =
  | { mode: "search"; query: string; point?: [number, number] }
  | { mode: "directions"; destination: string; origin: [number, number] | null; point?: [number, number] };
type MapTheme = "day" | "night";

const dayMapStyle: google.maps.MapTypeStyle[] = [
  { featureType: "poi", elementType: "labels", stylers: [{ visibility: "on" }] },
  { featureType: "landscape", elementType: "geometry", stylers: [{ color: "#edf2eb" }] },
  { featureType: "road", elementType: "geometry", stylers: [{ color: "#ffffff" }] },
  { featureType: "road.highway", elementType: "geometry", stylers: [{ color: "#f5d78d" }] },
  { featureType: "water", elementType: "geometry", stylers: [{ color: "#cfe5e5" }] },
  { elementType: "labels.text.fill", stylers: [{ color: "#52675c" }] },
];

const nightMapStyle: google.maps.MapTypeStyle[] = [
  { elementType: "geometry", stylers: [{ color: "#171c21" }] },
  { elementType: "labels.text.fill", stylers: [{ color: "#d2dbe0" }] },
  { elementType: "labels.text.stroke", stylers: [{ color: "#171c21" }] },
  { featureType: "administrative", elementType: "geometry.stroke", stylers: [{ color: "#3b454c" }] },
  { featureType: "landscape.natural", elementType: "geometry", stylers: [{ color: "#20292c" }] },
  { featureType: "poi", elementType: "geometry", stylers: [{ color: "#242d30" }] },
  { featureType: "poi", elementType: "labels.text.fill", stylers: [{ color: "#9eb5ad" }] },
  { featureType: "road", elementType: "geometry", stylers: [{ color: "#333c44" }] },
  { featureType: "road", elementType: "geometry.stroke", stylers: [{ color: "#222a30" }] },
  { featureType: "road.highway", elementType: "geometry", stylers: [{ color: "#655337" }] },
  { featureType: "transit", elementType: "geometry", stylers: [{ color: "#2e363d" }] },
  { featureType: "water", elementType: "geometry", stylers: [{ color: "#111d28" }] },
];

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

function distanceMeters(a: google.maps.LatLngLiteral, b: google.maps.LatLngLiteral) {
  const radians = (degrees: number) => degrees * Math.PI / 180;
  const dLat = radians(b.lat - a.lat);
  const dLng = radians(b.lng - a.lng);
  const lat1 = radians(a.lat);
  const lat2 = radians(b.lat);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 6_371_000 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

export default function RideSafeMap({ view, position, heading, driving, theme, onRouteSummary, onNavigationStep, onRerouteRequest, onRequestLocation }: {
  view: MapView;
  position: [number, number] | null;
  heading: number | null;
  driving: boolean;
  theme: MapTheme;
  onRouteSummary: (summary: { distance: string; duration: string } | null) => void;
  onNavigationStep: (step: { instruction: string; distance: string } | null) => void;
  onRerouteRequest: (point: [number, number]) => void;
  onRequestLocation: () => void;
}) {
  const canvas = useRef<HTMLDivElement>(null);
  const map = useRef<google.maps.Map | null>(null);
  const routeLines = useRef<google.maps.Polyline[]>([]);
  const markers = useRef<google.maps.Marker[]>([]);
  const userMarker = useRef<google.maps.Marker | null>(null);
  const cameraBounds = useRef<google.maps.LatLngBounds | google.maps.LatLngBoundsLiteral | null>(null);
  const routePath = useRef<google.maps.LatLngAltitude[]>([]);
  const routeSteps = useRef<google.maps.routes.RouteLegStep[]>([]);
  const activeStepIndex = useRef(0);
  const rerouteAfter = useRef(0);
  const latestDriving = useRef(driving);
  const latestPosition = useRef(position);
  const [status, setStatus] = useState("Waiting for your current location…");
  const [mapLoaded, setMapLoaded] = useState(false);
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
  latestDriving.current = driving;
  latestPosition.current = position;
  const fallbackParams = new URLSearchParams({ output: "embed", hl: "en" });
  if (view.mode === "directions") {
    if (view.origin) fallbackParams.set("saddr", `${view.origin[0]},${view.origin[1]}`);
    fallbackParams.set("daddr", view.point ? `${view.point[0]},${view.point[1]}` : view.destination);
  } else fallbackParams.set("q", view.point ? `${view.point[0]},${view.point[1]}` : view.query);

  useEffect(() => {
    let active = true;
    if (!apiKey) { setStatus("Google Maps API key is not configured yet."); return; }
    if (!position && !view.point) {
      setStatus("Allow location access to show your current location on the map.");
      return;
    }
    void loadMaps().then((library) => {
      if (!active || !library || !canvas.current) return;
      if (map.current) return;
      const center = view.mode === "directions" && view.origin
        ? { lat: view.origin[0], lng: view.origin[1] }
        : position ? { lat: position[0], lng: position[1] }
          : view.point ? { lat: view.point[0], lng: view.point[1] } : { lat: 0, lng: 0 };
      map.current = new library.Map(canvas.current, {
        center, zoom: 16, mapTypeControl: false, streetViewControl: false, fullscreenControl: true,
        clickableIcons: true, gestureHandling: "greedy", styles: theme === "night" ? nightMapStyle : dayMapStyle,
      });
      if (position) userMarker.current = new google.maps.Marker({ map: map.current, position: { lat: position[0], lng: position[1] }, title: "Your location", zIndex: 1000, icon: { path: google.maps.SymbolPath.CIRCLE, scale: 8, fillColor: "#4289e8", fillOpacity: 1, strokeColor: "#ffffff", strokeWeight: 3 } });
      setMapLoaded(true);
      setStatus("Google Maps is ready");
    }).catch(() => { if (active) setStatus("Google Maps could not load. Check the API key and enabled APIs."); });
    return () => { active = false; };
    // Wait for GPS before initializing the map; later GPS updates only move its marker.
  }, [apiKey, position, theme, view]);

  useEffect(() => {
    if (mapLoaded && map.current) map.current.setOptions({ styles: theme === "night" ? nightMapStyle : dayMapStyle });
  }, [mapLoaded, theme]);

  useEffect(() => {
    if (!mapLoaded || !map.current || !canvas.current) return;
    const resizeObserver = new ResizeObserver(() => {
      if (!map.current) return;
      google.maps.event.trigger(map.current, "resize");
      if (latestDriving.current && latestPosition.current) { map.current.setZoom(18); map.current.panTo({ lat: latestPosition.current[0], lng: latestPosition.current[1] }); }
      else if (cameraBounds.current) map.current.fitBounds(cameraBounds.current, 48);
    });
    resizeObserver.observe(canvas.current);
    return () => resizeObserver.disconnect();
  }, [mapLoaded]);

  useEffect(() => {
    if (!mapLoaded || !map.current || !position) return;
    const location = { lat: position[0], lng: position[1] };
    if (!userMarker.current) userMarker.current = new google.maps.Marker({ map: map.current, position: location, title: "Your location", zIndex: 1000, icon: { path: google.maps.SymbolPath.CIRCLE, scale: 8, fillColor: "#4289e8", fillOpacity: 1, strokeColor: "#ffffff", strokeWeight: 3 } });
    else userMarker.current.setPosition(location);
    if (driving) { map.current.setZoom(18); map.current.panTo(location); }
    if (heading !== null) userMarker.current.setIcon({ path: google.maps.SymbolPath.FORWARD_CLOSED_ARROW, scale: 6, fillColor: "#4289e8", fillOpacity: 1, strokeColor: "#ffffff", strokeWeight: 2, rotation: heading });
  }, [driving, heading, mapLoaded, position]);

  useEffect(() => {
    if (!mapLoaded || !map.current) return;
    if (view.point) map.current.panTo({ lat: view.point[0], lng: view.point[1] });
    routeLines.current.forEach((line) => line.setMap(null));
    routeLines.current = [];
    routePath.current = [];
    routeSteps.current = [];
    activeStepIndex.current = 0;
    onNavigationStep(null);
    if (view.mode === "directions") {
      onRouteSummary(null);
      if (!view.origin) {
        map.current.setZoom(14);
        setStatus("Choose My location first to show a driving route.");
        return;
      }
      setStatus("Finding the driving route…");
      let active = true;
      void google.maps.importLibrary("routes").then(async (library) => {
        const { Route } = library as google.maps.RoutesLibrary;
        const { routes } = await Route.computeRoutes({
          origin: { lat: view.origin![0], lng: view.origin![1] },
          destination: view.point ? { lat: view.point[0], lng: view.point[1] } : view.destination,
          travelMode: "DRIVING",
          routingPreference: "TRAFFIC_AWARE",
          fields: ["path", "legs", "legs.steps", "legs.steps.path", "legs.steps.instructions", "legs.steps.distanceMeters", "legs.steps.endLocation", "legs.steps.localizedValues", "distanceMeters", "durationMillis", "localizedValues", "viewport"],
        });
        const route = routes?.[0];
        if (!active || !route || !map.current) return;
        routePath.current = route.path ?? [];
        routeSteps.current = route.legs?.flatMap((leg) => leg.steps ?? []) ?? [];
        const firstStep = routeSteps.current[0];
        if (firstStep) onNavigationStep({ instruction: firstStep.instructions?.replace(/<[^>]*>/g, "") ?? "Continue on the route", distance: firstStep.localizedValues?.distance ?? `${Math.max(0, Math.round(firstStep.distanceMeters))} m` });
        routeLines.current = route.createPolylines({
          polylineOptions: { map: map.current, strokeColor: "#0f766e", strokeOpacity: 0.95, strokeWeight: 6 },
        });
        if (route.viewport) {
          cameraBounds.current = route.viewport;
          if (latestDriving.current && latestPosition.current) { map.current.setZoom(18); map.current.panTo({ lat: latestPosition.current[0], lng: latestPosition.current[1] }); }
          else map.current.fitBounds(route.viewport, 48);
        }
        const values = route.localizedValues;
        onRouteSummary({ distance: values?.distance ?? "Route ready", duration: values?.duration ?? "" });
        setStatus(values?.distance && values.duration
          ? `Driving route · ${values.distance} · ${values.duration}`
          : "Driving route ready");
      }).catch(() => { if (active) { onRouteSummary(null); onNavigationStep(null); setStatus("No driving route found. Check that Routes API is enabled, then try a nearby destination."); } });
      return () => { active = false; };
    }

    cameraBounds.current = null;
    onRouteSummary(null);

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
  }, [mapLoaded, onNavigationStep, onRouteSummary, view]);

  useEffect(() => {
    if (!driving || !position || !routeSteps.current.length) return;
    const current = { lat: position[0], lng: position[1] };
    while (activeStepIndex.current < routeSteps.current.length - 1) {
      const step = routeSteps.current[activeStepIndex.current];
      const end = step.endLocation;
      if (!end || distanceMeters(current, { lat: end.lat, lng: end.lng }) > 35) break;
      activeStepIndex.current += 1;
    }
    const step = routeSteps.current[activeStepIndex.current];
    if (step) {
      const end = step.endLocation;
      const remaining = end ? distanceMeters(current, { lat: end.lat, lng: end.lng }) : step.distanceMeters;
      const distance = remaining >= 1000 ? `${(remaining / 1000).toFixed(1)} km` : `${Math.max(0, Math.round(remaining / 10) * 10)} m`;
      onNavigationStep({ instruction: step.instructions?.replace(/<[^>]*>/g, "") ?? "Continue on the route", distance });
    }

    if (routePath.current.length && view.mode === "directions") {
      let nearestDistance = Number.POSITIVE_INFINITY;
      const path = routePath.current;
      for (let index = 0; index < path.length; index += 1) {
        const start = path[index];
        nearestDistance = Math.min(nearestDistance, distanceMeters(current, { lat: start.lat, lng: start.lng }));
        if (index === path.length - 1) continue;
        const end = path[index + 1];
        const meanLat = (start.lat + end.lat + current.lat) / 3 * Math.PI / 180;
        const scaleX = 111_320 * Math.cos(meanLat);
        const ax = (start.lng - current.lng) * scaleX;
        const ay = (start.lat - current.lat) * 111_320;
        const bx = (end.lng - current.lng) * scaleX;
        const by = (end.lat - current.lat) * 111_320;
        const dx = bx - ax;
        const dy = by - ay;
        const lengthSquared = dx * dx + dy * dy;
        const t = lengthSquared ? Math.max(0, Math.min(1, -(ax * dx + ay * dy) / lengthSquared)) : 0;
        nearestDistance = Math.min(nearestDistance, Math.hypot(ax + t * dx, ay + t * dy));
      }
      if (nearestDistance > 90 && Date.now() > rerouteAfter.current) {
        rerouteAfter.current = Date.now() + 20_000;
        onRerouteRequest(position);
        setStatus("You left the planned route · finding a new route…");
      }
    }
  }, [driving, onNavigationStep, onRerouteRequest, position, view]);

  if (!apiKey) return <div className="ridesafe-map-wrap map-unconfigured">{position ? <iframe className="ridesafe-google-map ridesafe-map-fallback" src={`https://www.google.com/maps?${fallbackParams.toString()}`} title="Google Maps fallback preview" loading="lazy" referrerPolicy="strict-origin-when-cross-origin" /> : <div className="ridesafe-map-fallback map-location-pending" aria-live="polite"><div><strong>Waiting for your location</strong><p>Allow location access so RideSafe can start at your current position.</p><button type="button" onClick={onRequestLocation}>Use my location</button></div></div>}<div className="map-setup-card"><span className="setup-icon">⌖</span><strong>Interactive map setup needed</strong><p>The map preview will centre on your GPS location when access is allowed. Add <code>NEXT_PUBLIC_GOOGLE_MAPS_API_KEY</code> in Vercel and enable Maps JavaScript API, Places API (New), and Routes API for live suggestions, nearby results, and in-page driving routes.</p><a href="https://developers.google.com/maps/documentation/javascript/get-api-key" target="_blank" rel="noreferrer">Google Maps setup guide ↗</a></div></div>;

  return <div className="ridesafe-map-wrap">
    <div ref={canvas} className="ridesafe-google-map" aria-label="Interactive Google map" />
    <div className="map-status" role="status"><span className={mapLoaded ? "live-dot" : ""} />{status}</div>
  </div>;
}
