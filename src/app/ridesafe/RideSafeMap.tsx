"use client";

import { useEffect, useRef, useState } from "react";
import type L from "leaflet";

type Props = {
  position: [number, number] | null;
  onPosition: (position: [number, number]) => void;
  onLocate: () => void;
};

export default function RideSafeMap({ position, onPosition, onLocate }: Props) {
  const element = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const marker = useRef<L.Marker | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let active = true;
    void import("leaflet").then((leaflet) => {
      if (!active || !element.current || map.current) return;
      const instance = leaflet.map(element.current, { zoomControl: false, attributionControl: true }).setView([14.5547, 121.0244], 13);
      leaflet.tileLayer(process.env.NEXT_PUBLIC_RIDESAFE_MAP_TILE_URL || "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
        attribution: process.env.NEXT_PUBLIC_RIDESAFE_MAP_ATTRIBUTION || '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      }).addTo(instance);
      leaflet.control.zoom({ position: "topright" }).addTo(instance);
      map.current = instance;
      setReady(true);
      window.setTimeout(() => instance.invalidateSize(), 100);
    });
    return () => {
      active = false;
      map.current?.remove();
      map.current = null;
      marker.current = null;
    };
  }, []);

  useEffect(() => {
    let active = true;
    void import("leaflet").then((leaflet) => {
      if (!active || !map.current || !position) return;
      if (!marker.current) {
        marker.current = leaflet.marker(position, {
          icon: leaflet.divIcon({ className: "ridesafe-location-icon", html: '<span aria-label="Your location"></span>', iconSize: [22, 22], iconAnchor: [11, 11] }),
        }).addTo(map.current);
      } else marker.current.setLatLng(position);
      map.current.setView(position, Math.max(map.current.getZoom(), 15), { animate: true });
    });
    return () => { active = false; };
  }, [position, ready]);

  useEffect(() => {
    const instance = map.current;
    if (!instance) return;
    const handleClick = (event: L.LeafletMouseEvent) => onPosition([event.latlng.lat, event.latlng.lng]);
    instance.on("click", handleClick);
    return () => { instance.off("click", handleClick); };
  }, [onPosition]);

  return <div className="ridesafe-map-wrap">
    <div ref={element} className="ridesafe-live-map" role="application" aria-label="Interactive OpenStreetMap. Choose a point on the map to use as your location." />
    <button className="recenter" aria-label="Use my current location" onClick={onLocate}>⌖</button>
    {!position && <div className="map-location-prompt"><span>⌖</span><b>Map is ready</b><small>Allow location to center on you, or tap the map to set a point.</small></div>}
  </div>;
}
