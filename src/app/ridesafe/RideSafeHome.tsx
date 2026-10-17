"use client";

import { useCallback, useState } from "react";
import RideSafeMap from "./RideSafeMap";

const categories = [
  { title: "Hospitals & ER", query: "hospital emergency room", icon: "+", tone: "rose" },
  { title: "Police & rescue", query: "police station rescue", icon: "✳", tone: "blue" },
  { title: "Roadside repair", query: "roadside assistance vulcanizing", icon: "⌁", tone: "gold" },
  { title: "Fuel", query: "gas station", icon: "◉", tone: "blue" },
  { title: "EV charging", query: "EV charging station", icon: "ϟ", tone: "mint" },
];
const vehicles = ["Car", "Motorcycle", "EV", "Hybrid", "Truck"];

export default function RideSafeHome() {
  const [vehicle, setVehicle] = useState("Car");
  const [query, setQuery] = useState("");
  const [position, setPosition] = useState<[number, number] | null>(null);
  const [mapView, setMapView] = useState<{ mode: "search"; query: string } | { mode: "directions"; destination: string; origin: [number, number] | null }>({ mode: "search", query: "Makati, Metro Manila" });
  const [locationState, setLocationState] = useState("Location not shared");
  const [helpOpen, setHelpOpen] = useState(false);
  const [notice, setNotice] = useState("");
  const [filter, setFilter] = useState("All");
  const [copied, setCopied] = useState(false);
  const tell = (message: string) => {
    setNotice(message);
    window.setTimeout(() => setNotice(""), 3500);
  };

  const locate = useCallback(() => {
    if (!navigator.geolocation) { setLocationState("Location is not available in this browser"); return; }
    setLocationState("Finding your location…");
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        const point: [number, number] = [coords.latitude, coords.longitude];
        setPosition(point);
        setLocationState("Your location · just now");
        setMapView((current) => current.mode === "directions"
          ? { ...current, origin: point }
          : { mode: "search", query: `${current.query.split(" near ")[0]} near ${point[0]},${point[1]}` });
      },
      (error) => setLocationState(error.code === error.PERMISSION_DENIED ? "Location permission denied · tap the map to choose a point" : "Could not get location · tap the map to choose a point"),
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 30000 },
    );
  }, []);

  const mapSearch = (search: string) => {
    const term = [search, vehicle === "Motorcycle" ? "motorcycle" : vehicle === "EV" ? "electric vehicle" : ""].filter(Boolean).join(" ");
    setMapView({ mode: "search", query: position ? `${term} near ${position[0]},${position[1]}` : term });
    document.querySelector("#ridesafe-map")?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  };

  const openRoute = () => {
    if (!query.trim()) { tell("Enter a destination first to plan your trip."); return; }
    setMapView({ mode: "directions", destination: query.trim(), origin: position });
    document.querySelector("#ridesafe-map")?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  };

  const shareLocation = async () => {
    if (!position) { tell("Choose your current location first."); return; }
    const url = `https://www.google.com/maps?q=${position[0]},${position[1]}`;
    const text = `My RideSafe location: ${position[0].toFixed(5)}, ${position[1].toFixed(5)} — ${url}`;
    try {
      if (navigator.share) await navigator.share({ title: "My RideSafe location", text, url });
      else { await navigator.clipboard.writeText(text); setCopied(true); window.setTimeout(() => setCopied(false), 2500); }
    } catch { /* The user can dismiss the system share sheet without sharing. */ }
  };

  const visibleCategories = categories.filter((item) => filter === "All" || item.title === filter);

  return (
    <div className="ridesafe-app" data-ridesafe-root="true">
      <main className="app-shell">
        <div className="workspace" id="home">
          <section className="map-panel" id="ridesafe-map" aria-label="Google Maps">
            <div className="map-topline"><div className="location-label"><span className="pin-small">⌖</span><span><small>GOOGLE MAPS</small><strong>{locationState}</strong></span></div><button className="map-icon-button" aria-label="Use my current location" onClick={locate}>⌖</button></div>
            <RideSafeMap view={mapView} />
        <div className="map-footer"><span><span className="live-dot" /> Google Maps · interactive in RideSafe</span><span className="map-provider-note">Google account features follow your browser session</span></div>
          </section>

          <aside className="side-panel">
            <section className="welcome"><div><span className="eyebrow">YOUR ROAD COMPANION</span><h1>Where are you<br />headed today?</h1><p>Plan a route or find help nearby.</p></div><span className="sun-mark">✳</span></section>
            <form className="trip-search" onSubmit={(event) => { event.preventDefault(); openRoute(); }}>
              <label className="search-box"><span>⌕</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Where do you want to go?" aria-label="Trip destination" /><button type="submit" aria-label="Plan route">→</button></label>
              <div className="route-actions"><small>Show destination and route on the map above</small><button type="submit">Show route on map <span>↑</span></button></div>
            </form>
            <div className="vehicle-row"><span>Vehicle</span><div className="vehicle-switch" role="group" aria-label="Choose vehicle">{vehicles.map((item) => <button key={item} className={vehicle === item ? "selected" : ""} onClick={() => setVehicle(item)}>{item === "EV" ? "ϟ" : item === "Motorcycle" ? "⌁" : item === "Car" ? "▰" : "◈"}<span>{item}</span></button>)}</div></div>
            <div className="section-heading"><div><span className="eyebrow">SEARCH NEAR YOU</span><h2>Find a service</h2></div><button className="text-button" onClick={() => mapSearch(query || "roadside assistance")}>Search map <span>↗</span></button></div>
            <div className="filter-row" aria-label="Filter service categories">{["All", ...categories.map((item) => item.title)].map((item) => <button key={item} className={`filter-chip ${filter === item ? "active" : ""}`} onClick={() => setFilter(item)}>{item}</button>)}</div>
            <div className="service-list">{visibleCategories.map((item) => <article className="service-row" key={item.title}><span className={`place-icon ${item.tone}`}>{item.icon}</span><div><h3>{item.title}</h3><p>Search current map results · verify details before travelling</p></div><button aria-label={`Search ${item.title} on Google Maps`} onClick={() => mapSearch(item.query)}>Find <span>↗</span></button></article>)}</div>
            <div className="trust-note"><span>✦</span><p>Search results are supplied by Google Maps. FLAME PH has not verified these listings.</p></div>
          </aside>
        </div>

        <button className="help-fab" onClick={() => setHelpOpen(true)}><span className="help-icon">!</span><span><b>I need help</b><small>Emergency or vehicle problem</small></span><span className="fab-arrow">→</span></button>
        {notice && <div className="toast" role="status">{notice}</div>}
        {helpOpen && <div className="modal-backdrop" onClick={() => setHelpOpen(false)}><section className="help-modal" role="dialog" aria-modal="true" aria-labelledby="help-title" onClick={(event) => event.stopPropagation()}><button className="close-modal" onClick={() => setHelpOpen(false)} aria-label="Close">×</button><span className="eyebrow">WE’RE HERE WITH YOU</span><h2 id="help-title">Is anyone hurt<br />or in danger?</h2><p>If someone is in immediate danger, contact emergency services now.</p><a className="call-911" href="tel:911"><span>Call 911</span><b>↗</b></a><button className="vehicle-help" onClick={() => { setHelpOpen(false); mapSearch(vehicle === "EV" ? "EV capable roadside assistance flatbed towing" : "roadside assistance near me"); }}>Find roadside help nearby <span>→</span></button><button className="vehicle-help share-location" onClick={shareLocation}>{copied ? "Location copied" : "Share my location"}<span>↗</span></button><div className="emergency-coordinates">{position ? `Map point: ${position[0].toFixed(5)}, ${position[1].toFixed(5)}` : "Allow location or tap the map to set a location."}</div><small className="modal-footnote">RideSafe helps you find help. It is not an emergency service.</small></section></div>}
      </main>
    </div>
  );
}
