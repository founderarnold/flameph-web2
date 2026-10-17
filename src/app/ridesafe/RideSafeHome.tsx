"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/browser";
import RideSafeMap, { loadMaps } from "./RideSafeMap";

const categories = [
  { title: "Hospitals & clinics", query: "hospital clinic", icon: "+", tone: "rose", provider: "Hospital or clinic" },
  { title: "Police & rescue", query: "police station", icon: "✳", tone: "blue", provider: "Police or rescue station" },
  { title: "Towing services", query: "towing service", icon: "↗", tone: "gold", provider: "Towing service" },
  { title: "Vulcanizing & tire shops", query: "vulcanizing tire repair", icon: "◉", tone: "gold", provider: "Vulcanizing or tire shop" },
  { title: "Mechanics on the go", query: "mobile mechanic", icon: "⌁", tone: "blue", provider: "On-call mechanic" },
  { title: "Fuel stations", query: "gas station", icon: "◉", tone: "blue", provider: "Fuel station" },
  { title: "EV charging", query: "EV charging station", icon: "ϟ", tone: "mint", provider: "EV charging station" },
  { title: "Battery shops", query: "car battery shop", icon: "ϟ", tone: "mint", provider: "Battery shop" },
  { title: "Inns & transient stays", query: "motel inn transient house", icon: "⌂", tone: "rose", provider: "Inn or transient stay" },
];
const vehicles = ["Car", "Motorcycle", "EV", "Hybrid", "Truck"];
type MapView =
  | { mode: "search"; query: string; point?: [number, number] }
  | { mode: "directions"; destination: string; origin: [number, number] | null; point?: [number, number] };
type RideSafeProvider = { id: string; name: string; products: string | null; city: string | null; province: string | null; contact_phone: string | null };

export default function RideSafeHome() {
  const [vehicle, setVehicle] = useState("Car");
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState<google.maps.places.PlacePrediction[]>([]);
  const [searching, setSearching] = useState(false);
  const [position, setPosition] = useState<[number, number] | null>(null);
  const [routeSummary, setRouteSummary] = useState<{ distance: string; duration: string } | null>(null);
  const [driving, setDriving] = useState(false);
  const [mapView, setMapView] = useState<MapView>({ mode: "search", query: "Makati, Metro Manila" });
  const [locationState, setLocationState] = useState("Location not shared");
  const [helpOpen, setHelpOpen] = useState(false);
  const [notice, setNotice] = useState("");
  const [filter, setFilter] = useState("All");
  const [copied, setCopied] = useState(false);
  const [providers, setProviders] = useState<RideSafeProvider[]>([]);
  const pendingRoute = useRef<{ destination: string; point?: [number, number] } | null>(null);
  const [providerCategory, setProviderCategory] = useState(categories[0].provider);
  const tell = (message: string) => { setNotice(message); window.setTimeout(() => setNotice(""), 3500); };

  useEffect(() => {
    const text = query.trim();
    if (text.length < 2 || !process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY) { setSuggestions([]); setSearching(false); return; }
    let active = true;
    setSearching(true);
    const timer = window.setTimeout(() => {
      void loadMaps().then(() => google.maps.importLibrary("places")).then(async (placesLib) => {
        const places = placesLib as google.maps.PlacesLibrary;
        const { suggestions: matches } = await places.AutocompleteSuggestion.fetchAutocompleteSuggestions({ input: text, includedRegionCodes: ["ph"] });
        if (active) setSuggestions(matches.map((item) => item.placePrediction).filter((item): item is google.maps.places.PlacePrediction => Boolean(item)));
      }).catch(() => { if (active) setSuggestions([]); }).finally(() => { if (active) setSearching(false); });
    }, 180);
    return () => { active = false; window.clearTimeout(timer); };
  }, [query]);

  useEffect(() => {
    const supabase = createClient();
    if (!supabase) return;
    let active = true;
    void supabase.from("businesses").select("id,name,products,city,province,contact_phone").eq("published", true).ilike("products", "%RideSafe provider service:%").limit(100)
      .then(({ data }) => { if (active) setProviders((data ?? []) as RideSafeProvider[]); });
    return () => { active = false; };
  }, []);

  const chooseDestination = async (prediction: google.maps.places.PlacePrediction) => {
    setSearching(true);
    setSuggestions([]);
    try {
      const place = prediction.toPlace();
      await place.fetchFields({ fields: ["displayName", "formattedAddress", "location"] });
      const name = place.formattedAddress || place.displayName || prediction.text.toString();
      const point = place.location ? [place.location.lat(), place.location.lng()] as [number, number] : undefined;
      setQuery(name);
      setMapView({ mode: "search", query: name, point });
    } catch { tell("That address could not be loaded. Try another suggestion."); }
    finally { setSearching(false); }
  };

  const locate = useCallback(() => {
    if (!navigator.geolocation) { setLocationState("Location is not available in this browser"); return; }
    setLocationState("Finding your location…");
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        const point: [number, number] = [coords.latitude, coords.longitude];
        setPosition(point);
        setLocationState("Your location · just now");
        const requestedRoute = pendingRoute.current;
        if (requestedRoute) {
          pendingRoute.current = null;
          setMapView({ mode: "directions", destination: requestedRoute.destination, origin: point, point: requestedRoute.point });
        } else {
          setMapView((current) => current.mode === "directions" ? { ...current, origin: point } : { mode: "search", query: "nearby roadside help", point });
        }
      },
      (error) => {
        pendingRoute.current = null;
        setLocationState(error.code === error.PERMISSION_DENIED ? "Location permission denied" : "Could not get location");
      },
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 30000 },
    );
  }, []);

  useEffect(() => { locate(); }, [locate]);

  const mapSearch = (search: string) => {
    const term = [search, vehicle === "Motorcycle" ? "motorcycle" : vehicle === "EV" ? "electric vehicle" : ""].filter(Boolean).join(" ");
    setMapView({ mode: "search", query: position ? `${term} near ${position[0]},${position[1]}` : term });
    document.querySelector("#ridesafe-map")?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  };

  const openRoute = () => {
    if (!query.trim()) { tell("Type a destination and choose a Google Maps suggestion first."); return; }
    const point = mapView.mode === "search" ? mapView.point : undefined;
    if (!position) {
      pendingRoute.current = { destination: query.trim(), point };
      tell("Finding your location, then we’ll show your route.");
      locate();
      return;
    }
    setDriving(false);
    setMapView({ mode: "directions", destination: query.trim(), origin: position, point });
    setRouteSummary(null);
    document.querySelector("#ridesafe-map")?.scrollIntoView({ behavior: "smooth", block: "start" });
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
            <RideSafeMap view={mapView} position={position} driving={driving} onRouteSummary={setRouteSummary} />
            <div className="map-footer"><span><span className="live-dot" /> Google Maps · in RideSafe</span><span className="map-provider-note">Route and place data by Google</span></div>
          </section>

          <aside className="side-panel">
            <section className="welcome"><div><span className="eyebrow">YOUR ROAD COMPANION</span><h1>Where are you<br />headed today?</h1><p>Plan a route or find help nearby.</p></div><span className="sun-mark">✳</span></section>
            <form className="trip-search" onSubmit={(event) => { event.preventDefault(); openRoute(); }}>
              <label className="search-box"><span>⌕</span><input autoComplete="off" value={query} onChange={(event) => setQuery(event.target.value)} onKeyDown={(event) => { if (event.key === "Escape") setSuggestions([]); if (event.key === "Enter" && suggestions[0]) { event.preventDefault(); void chooseDestination(suggestions[0]); } }} placeholder="Type an address or destination" aria-label="Trip destination" aria-autocomplete="list" aria-controls="ridesafe-suggestions" /><button type="submit" aria-label="Plan route">→</button></label>
              {(suggestions.length > 0 || searching) && <div className="autocomplete-results" id="ridesafe-suggestions" role="listbox" aria-label="Google Maps suggestions">{searching && <p className="autocomplete-loading">Searching Google Maps…</p>}{suggestions.map((suggestion) => <button type="button" role="option" aria-selected="false" key={suggestion.placeId} onClick={() => void chooseDestination(suggestion)}><span className="suggest-pin">⌖</span><span><strong>{suggestion.mainText?.text ?? suggestion.text.toString()}</strong><small>{suggestion.secondaryText?.text ?? "Google Maps place"}</small></span></button>)}</div>}
              {!process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY && <p className="api-key-hint">Google Maps suggestions will activate when the Maps API key is configured.</p>}
              <div className="route-actions"><small>Choose a Google Maps suggestion for the best match</small><button type="submit">Show driving route <span>↑</span></button></div>
            </form>
            {mapView.mode === "directions" && <section className="route-card" aria-live="polite">
              <div className="route-card-copy"><span className="route-icon">↗</span><div><strong>{routeSummary ? `${routeSummary.distance} · ${routeSummary.duration}` : "Preparing your driving route…"}</strong><small>{driving ? "Driving mode is on · follow your route on the map" : `To ${mapView.destination}`}</small></div></div>
              {driving
                ? <button type="button" className="route-end" onClick={() => { setDriving(false); setLocationState("Your location · just now"); }}>End trip</button>
                : <button type="button" className="route-start" disabled={!routeSummary || !position} onClick={() => { if (!position) { tell("Allow location access to start driving mode."); locate(); return; } setDriving(true); setLocationState("Driving mode · location updating"); }}>Start Driving <span>→</span></button>}
            </section>}
            <div className="vehicle-row"><span>Vehicle</span><div className="vehicle-switch" role="group" aria-label="Choose vehicle">{vehicles.map((item) => <button type="button" key={item} className={vehicle === item ? "selected" : ""} onClick={() => setVehicle(item)}>{item === "EV" ? "ϟ" : item === "Motorcycle" ? "⌁" : item === "Car" ? "▰" : "◈"}<span>{item}</span></button>)}</div></div>
            <div className="section-heading"><div><span className="eyebrow">SEARCH NEAR YOU</span><h2>Find a service</h2></div><button type="button" className="text-button" onClick={() => mapSearch(query || "roadside assistance")}>Search map <span>↗</span></button></div>
            <div className="filter-row" aria-label="Filter service categories">{["All", ...categories.map((item) => item.title)].map((item) => <button type="button" key={item} className={`filter-chip ${filter === item ? "active" : ""}`} onClick={() => setFilter(item)}>{item}</button>)}</div>
            <div className="service-list">{visibleCategories.map((item) => <article className="service-row" key={item.title}><span className={`place-icon ${item.tone}`}>{item.icon}</span><div><h3>{item.title}</h3><p>Google Maps results · verify details before travelling</p></div><button type="button" aria-label={`Search ${item.title} on Google Maps`} onClick={() => mapSearch(item.query)}>Find <span>↗</span></button></article>)}</div>
            {providers.length > 0 && <section className="local-providers" aria-label="RideSafe providers"><div className="local-providers-heading"><strong>FLAME PH RideSafe providers</strong><span>Member businesses</span></div>{providers.filter((business) => filter === "All" || business.products?.toLowerCase().includes(categories.find((item) => item.title === filter)?.provider.toLowerCase() ?? filter.toLowerCase())).map((business) => <article className="local-provider" key={business.id}><span className="provider-pin">✦</span><div><strong>{business.name}</strong><small>{[business.city, business.province].filter(Boolean).join(" · ") || "Philippines"}</small>{business.products && <small>{business.products.replace(/^.*RideSafe provider service:\s*/i, "")}</small>}</div>{business.contact_phone && <a href={`tel:${business.contact_phone}`} aria-label={`Call ${business.name}`}>Call</a>}<button type="button" aria-label={`Find ${business.name} on the map`} onClick={() => mapSearch(`${business.name} ${business.city ?? ""} ${business.province ?? ""}`)}>Map ↗</button></article>)}</section>}
            <div className="provider-join"><div><span className="eyebrow">BUSINESS OWNERS</span><h2>Help drivers find you</h2><p>Join RideSafe using your FLAME PH account and add your service to your business listing.</p></div><label className="provider-category-label" htmlFor="provider-category">What kind of business do you run?</label><select id="provider-category" className="provider-category-select" value={providerCategory} onChange={(event) => setProviderCategory(event.target.value)}>{categories.map((item) => <option key={item.provider} value={item.provider}>{item.provider}</option>)}<option value="Roadside assistance">Other roadside assistance</option></select><Link href={`/ridesafe/providers/apply?category=${encodeURIComponent(providerCategory)}`} className="provider-main-cta">Continue to business signup <span>→</span></Link></div>
            <div className="trust-note"><span>✦</span><p>Search results are supplied by Google Maps. FLAME PH has not verified these listings.</p></div>
          </aside>
        </div>

        <button className="help-fab" onClick={() => setHelpOpen(true)}><span className="help-icon">!</span><span><b>I need help</b><small>Emergency or vehicle problem</small></span><span className="fab-arrow">→</span></button>
        {notice && <div className="toast" role="status">{notice}</div>}
        {helpOpen && <div className="modal-backdrop" onClick={() => setHelpOpen(false)}><section className="help-modal" role="dialog" aria-modal="true" aria-labelledby="help-title" onClick={(event) => event.stopPropagation()}><button className="close-modal" onClick={() => setHelpOpen(false)} aria-label="Close">×</button><span className="eyebrow">WE’RE HERE WITH YOU</span><h2 id="help-title">Is anyone hurt<br />or in danger?</h2><p>If someone is in immediate danger, contact emergency services now.</p><a className="call-911" href="tel:911"><span>Call 911</span><b>↗</b></a><button className="vehicle-help" onClick={() => { setHelpOpen(false); mapSearch(vehicle === "EV" ? "EV capable roadside assistance flatbed towing" : "roadside assistance near me"); }}>Find roadside help nearby <span>→</span></button><button className="vehicle-help share-location" onClick={shareLocation}>{copied ? "Location copied" : "Share my location"}<span>↗</span></button><div className="emergency-coordinates">{position ? `Map point: ${position[0].toFixed(5)}, ${position[1].toFixed(5)}` : "Allow location to share your coordinates."}</div><small className="modal-footnote">RideSafe helps you find help. It is not an emergency service.</small></section></div>}
      </main>
    </div>
  );
}
