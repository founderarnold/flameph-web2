"use client";

import { useCallback, useState } from "react";
import Link from "next/link";
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
  const [locationState, setLocationState] = useState("Location not shared");
  const [helpOpen, setHelpOpen] = useState(false);
  const [notice, setNotice] = useState("");
  const [filter, setFilter] = useState("All");
  const [copied, setCopied] = useState(false);
  const tell = (message: string) => {
    setNotice(message);
    window.setTimeout(() => setNotice(""), 3500);
  };

  const setMapPoint = useCallback((point: [number, number]) => {
    setPosition(point);
    setLocationState("Map point selected");
  }, []);

  const locate = useCallback(() => {
    if (!navigator.geolocation) { setLocationState("Location is not available in this browser"); return; }
    setLocationState("Finding your location…");
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => { setPosition([coords.latitude, coords.longitude]); setLocationState("Your location · just now"); },
      (error) => setLocationState(error.code === error.PERMISSION_DENIED ? "Location permission denied · tap the map to choose a point" : "Could not get location · tap the map to choose a point"),
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 30000 },
    );
  }, []);

  const mapSearch = (search: string) => {
    const term = [search, vehicle === "Motorcycle" ? "motorcycle" : vehicle === "EV" ? "electric vehicle" : ""].filter(Boolean).join(" ");
    const center = position ? `&center=${position[0]},${position[1]}` : "";
    window.open(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(term)}${center}`, "_blank", "noopener,noreferrer");
  };

  const openRoute = (provider: "Google Maps" | "Waze") => {
    if (!query.trim()) { tell("Enter a destination first to plan your trip."); return; }
    const destination = encodeURIComponent(query.trim());
    const origin = position ? `&origin=${encodeURIComponent(`${position[0]},${position[1]}`)}` : "";
    const href = provider === "Google Maps"
      ? `https://www.google.com/maps/dir/?api=1&destination=${destination}&travelmode=driving${origin}`
      : `https://www.waze.com/ul?q=${destination}&navigate=yes${position ? `&ll=${position[0]}%2C${position[1]}` : ""}`;
    window.open(href, "_blank", "noopener,noreferrer");
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
        <header className="topbar">
          <Link className="brand" href="/ridesafe" aria-label="RideSafe home"><span className="brand-mark">R</span><span>FLAME PH <b>RideSafe</b></span></Link>
          <div className="top-actions"><Link className="ecosystem-pill" href="/login"><span className="status-dot" />FLAME PH account</Link><Link className="avatar" href="/account" aria-label="Open your FLAME PH account">↗</Link></div>
        </header>

        <div className="workspace" id="home">
          <section className="map-panel" aria-label="Live OpenStreetMap">
            <div className="map-topline"><div className="location-label"><span className="pin-small">⌖</span><span><small>MAP AREA</small><strong>{locationState}</strong></span></div><button className="map-icon-button" aria-label="Use my current location" onClick={locate}>⌖</button></div>
            <RideSafeMap position={position} onPosition={setMapPoint} onLocate={locate} />
            <div className="map-footer"><span><span className="live-dot" /> OpenStreetMap · live map tiles</span><span className="map-provider-note">Traffic and road closures are not shown here</span></div>
          </section>

          <aside className="side-panel">
            <section className="welcome"><div><span className="eyebrow">YOUR ROAD COMPANION</span><h1>Where are you<br />headed today?</h1><p>Plan a route or find help nearby.</p></div><span className="sun-mark">✳</span></section>
            <form className="trip-search" onSubmit={(event) => { event.preventDefault(); openRoute("Google Maps"); }}>
              <label className="search-box"><span>⌕</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Where do you want to go?" aria-label="Trip destination" /><button type="submit" aria-label="Plan route">→</button></label>
              <div className="route-actions"><button type="button" onClick={() => openRoute("Google Maps")}>Google Maps <span>↗</span></button><button type="button" onClick={() => openRoute("Waze")}>Waze <span>↗</span></button><small>Navigation opens in your selected app</small></div>
            </form>
            <div className="vehicle-row"><span>Vehicle</span><div className="vehicle-switch" role="group" aria-label="Choose vehicle">{vehicles.map((item) => <button key={item} className={vehicle === item ? "selected" : ""} onClick={() => setVehicle(item)}>{item === "EV" ? "ϟ" : item === "Motorcycle" ? "⌁" : item === "Car" ? "▰" : "◈"}<span>{item}</span></button>)}</div></div>
            <div className="section-heading"><div><span className="eyebrow">SEARCH NEAR YOU</span><h2>Find a service</h2></div><button className="text-button" onClick={() => mapSearch(query || "roadside assistance")}>Search map <span>↗</span></button></div>
            <div className="filter-row" aria-label="Filter service categories">{["All", ...categories.map((item) => item.title)].map((item) => <button key={item} className={`filter-chip ${filter === item ? "active" : ""}`} onClick={() => setFilter(item)}>{item}</button>)}</div>
            <div className="service-list">{visibleCategories.map((item) => <article className="service-row" key={item.title}><span className={`place-icon ${item.tone}`}>{item.icon}</span><div><h3>{item.title}</h3><p>Search current map results · verify details before travelling</p></div><button aria-label={`Search ${item.title} on Google Maps`} onClick={() => mapSearch(item.query)}>Find <span>↗</span></button></article>)}</div>
            <div className="trust-note"><span>✦</span><p>Results open in Google Maps. RideSafe has not verified these listings.</p></div>
          </aside>
        </div>

        <button className="help-fab" onClick={() => setHelpOpen(true)}><span className="help-icon">!</span><span><b>I need help</b><small>Emergency or vehicle problem</small></span><span className="fab-arrow">→</span></button>
        <nav className="mobile-nav" aria-label="Main navigation"><button className="nav-active" onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}>⌖<span>Map</span></button><button onClick={() => document.querySelector<HTMLInputElement>(".search-box input")?.focus()}>⌕<span>Search</span></button><button onClick={() => document.querySelector<HTMLInputElement>(".search-box input")?.focus()}>⌁<span>Trips</span></button><Link className="account-nav" href="/account">◉<span>My RideSafe</span></Link></nav>
        {notice && <div className="toast" role="status">{notice}</div>}
        {helpOpen && <div className="modal-backdrop" onClick={() => setHelpOpen(false)}><section className="help-modal" role="dialog" aria-modal="true" aria-labelledby="help-title" onClick={(event) => event.stopPropagation()}><button className="close-modal" onClick={() => setHelpOpen(false)} aria-label="Close">×</button><span className="eyebrow">WE’RE HERE WITH YOU</span><h2 id="help-title">Is anyone hurt<br />or in danger?</h2><p>If someone is in immediate danger, contact emergency services now.</p><a className="call-911" href="tel:911"><span>Call 911</span><b>↗</b></a><button className="vehicle-help" onClick={() => { setHelpOpen(false); mapSearch(vehicle === "EV" ? "EV capable roadside assistance flatbed towing" : "roadside assistance near me"); }}>Find roadside help nearby <span>→</span></button><button className="vehicle-help share-location" onClick={shareLocation}>{copied ? "Location copied" : "Share my location"}<span>↗</span></button><div className="emergency-coordinates">{position ? `Map point: ${position[0].toFixed(5)}, ${position[1].toFixed(5)}` : "Allow location or tap the map to set a location."}</div><small className="modal-footnote">RideSafe helps you find help. It is not an emergency service.</small></section></div>}
        <footer className="page-footer"><span>FLAME PH RideSafe · Find help. Drive safer. Travel smarter.</span><span>Map data © OpenStreetMap contributors. Navigation and listings are provided by linked services.</span></footer>
      </main>
    </div>
  );
}
