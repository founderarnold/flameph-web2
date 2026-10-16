"use client";

import { useMemo, useState } from "react";
import Link from "next/link";

const places = [
  { type: "EV charging", icon: "ϟ", name: "Ayala Malls Manila Bay", detail: "CCS2 · 120 kW · Status unverified", distance: "1.2 km", tone: "mint" },
  { type: "Roadside", icon: "⌁", name: "Rodel Tire & Vulcanizing", detail: "Car · Motorcycle · Open 24 hours", distance: "2.4 km", tone: "gold" },
  { type: "Emergency", icon: "+", name: "Makati Medical Center", detail: "Emergency room · Open 24 hours", distance: "3.1 km", tone: "rose" },
  { type: "Fuel", icon: "◉", name: "Shell Macapagal", detail: "Fuel prices not recently verified", distance: "3.8 km", tone: "blue" },
];

const filters = ["All", "Roadside", "EV charging", "Fuel", "Emergency"];

export default function Home() {
  const [filter, setFilter] = useState("All");
  const [vehicle, setVehicle] = useState("Car");
  const [query, setQuery] = useState("");
  const [helpOpen, setHelpOpen] = useState(false);
  const [notice, setNotice] = useState("");
  const visiblePlaces = useMemo(() => places.filter((place) =>
    (filter === "All" || place.type === filter) &&
    `${place.name} ${place.type} ${place.detail}`.toLowerCase().includes(query.toLowerCase())
  ), [filter, query]);

  function tell(message: string) {
    setNotice(message);
    window.setTimeout(() => setNotice(""), 3200);
  }

  return (
    <div className="ridesafe-app" data-ridesafe-root="true">
    <main className="app-shell">
      <header className="topbar">
        <a className="brand" href="#home" aria-label="RideSafe home"><span className="brand-mark">R</span><span>FLAME PH <b>RideSafe</b></span></a>
        <div className="top-actions"><Link className="ecosystem-pill" href="/login">Sign in to FLAME PH</Link><Link className="avatar" href="/account" aria-label="Open your FLAME PH account">↗</Link></div>
      </header>

      <div className="workspace" id="home">
        <section className="map-panel" aria-label="RideSafe map">
          <div className="map-topline"><div className="location-label"><span className="pin-small">⌖</span><span><small>YOUR AREA</small><strong>Makati, Metro Manila</strong></span><span className="chevron">⌄</span></div><button className="map-icon-button" aria-label="Map layers" onClick={() => tell("Map layers will be available when maps are connected.")}>▤</button></div>
          <div className="map-art" aria-label="Map preview, sample location">
            <div className="map-grid" />
            <div className="river" />
            <div className="road road-main" /><div className="road road-cross" /><div className="road road-diagonal" />
            <span className="map-label label-one">MAKATI</span><span className="map-label label-two">MANILA BAY</span><span className="map-label label-three">PASAY</span>
            <span className="route-line" />
            <span className="map-marker marker-ev">ϟ</span><span className="map-marker marker-help">⌁</span><span className="map-marker marker-hospital">+</span>
            <span className="you-marker"><i /></span>
            <button className="recenter" aria-label="Recenter map" onClick={() => tell("Map preview: location is illustrative until location permission and maps are configured.")}>⌖</button>
            <div className="map-disclaimer">Preview map · Sample places, not live navigation</div>
          </div>
          <div className="map-footer"><span><span className="live-dot" /> Road safety, at a glance</span><button onClick={() => tell("Live road conditions will appear when a trusted data source is connected.")}>Road conditions <b>›</b></button></div>
        </section>

        <aside className="side-panel">
          <section className="welcome"><div><span className="eyebrow">YOUR ROAD COMPANION</span><h1>Where are you<br />headed today?</h1><p>Find trusted help and useful stops along your way.</p></div><span className="sun-mark">✳</span></section>
          <label className="search-box"><span>⌕</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search places or services" /><kbd>⌘ K</kbd></label>
          <div className="vehicle-row"><span>I&apos;m driving</span><div className="vehicle-switch" role="group" aria-label="Choose vehicle">{["Car", "Moto", "EV"].map((item) => <button key={item} className={vehicle === item ? "selected" : ""} onClick={() => setVehicle(item)}>{item === "Car" ? "▰" : item === "Moto" ? "⌁" : "ϟ"}<span>{item}</span></button>)}</div></div>
          <div className="section-heading"><div><span className="eyebrow">EXPLORE NEARBY</span><h2>Good to know</h2></div><button className="text-button" onClick={() => setFilter("All")}>View map <span>↗</span></button></div>
          <div className="filter-row">{filters.map((item) => <button key={item} className={`filter-chip ${filter === item ? "active" : ""}`} onClick={() => setFilter(item)}>{item}</button>)}</div>
          <div className="place-list">{visiblePlaces.length ? visiblePlaces.map((place) => <article className="place-card" key={place.name}><span className={`place-icon ${place.tone}`}>{place.icon}</span><div className="place-copy"><div className="place-title"><h3>{place.name}</h3><span>{place.distance}</span></div><p>{place.detail}</p><div className="place-actions"><button onClick={() => tell(`Calling ${place.name} requires a verified phone listing.`)}>Call</button><button onClick={() => tell("Directions will open when a mapping provider is configured.")}>Directions <span>↗</span></button><small>{place.type}</small></div></div></article>) : <div className="empty-state">No matching places. Try another search or category.</div>}</div>
          <div className="trust-note"><span>✦</span><p>We show where information comes from, so you can make the call.</p></div>
        </aside>
      </div>

      <button className="help-fab" onClick={() => setHelpOpen(true)}><span className="help-icon">!</span><span><b>I need help</b><small>Emergency or vehicle problem</small></span><span className="fab-arrow">→</span></button>
      <nav className="mobile-nav" aria-label="Main navigation"><button className="nav-active" onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}>⌖<span>Map</span></button><button onClick={() => document.querySelector<HTMLInputElement>(".search-box input")?.focus()}>⌕<span>Search</span></button><button onClick={() => tell("Trip planning will be added with live route services.")}>⌁<span>Trips</span></button><Link className="account-nav" href="/account">◉<span>My RideSafe</span></Link></nav>
      {notice && <div className="toast" role="status">{notice}</div>}
      {helpOpen && <div className="modal-backdrop" onClick={() => setHelpOpen(false)}><section className="help-modal" role="dialog" aria-modal="true" aria-labelledby="help-title" onClick={(event) => event.stopPropagation()}><button className="close-modal" onClick={() => setHelpOpen(false)} aria-label="Close">×</button><span className="eyebrow">WE’RE HERE WITH YOU</span><h2 id="help-title">Is anyone hurt<br />or in danger?</h2><p>If someone is in immediate danger, contact emergency services now.</p><a className="call-911" href="tel:911"><span>Call 911</span><b>↗</b></a><button className="vehicle-help" onClick={() => { setHelpOpen(false); setFilter("Roadside"); tell("Showing nearby roadside help. Confirm details before travelling."); }}>No, I need roadside help <span>→</span></button><small className="modal-footnote">RideSafe helps you find help. It is not an emergency service.</small></section></div>}
      <footer className="page-footer"><span>FLAME PH RideSafe · Find help. Drive safer. Travel smarter.</span><span>Information shown here may be sample or unverified.</span></footer>
    </main>
    </div>
  );
}
