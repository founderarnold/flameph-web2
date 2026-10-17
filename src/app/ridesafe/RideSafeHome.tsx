"use client";

import Link from "next/link";
import Image from "next/image";
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
type RideSafeTheme = "day" | "night";
type RideSafePlace = { label: string; address: string; point?: [number, number] };

function getLocalTimeTheme(): RideSafeTheme {
  const hour = new Date().getHours();
  return hour >= 18 || hour < 6 ? "night" : "day";
}

export default function RideSafeHome() {
  const [vehicle, setVehicle] = useState("Car");
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState<google.maps.places.PlacePrediction[]>([]);
  const [searching, setSearching] = useState(false);
  const [position, setPosition] = useState<[number, number] | null>(null);
  const [routeSummary, setRouteSummary] = useState<{ distance: string; duration: string } | null>(null);
  const [navigationStep, setNavigationStep] = useState<{ instruction: string; distance: string } | null>(null);
  const [speedKph, setSpeedKph] = useState<number | null>(null);
  const [heading, setHeading] = useState<number | null>(null);
  const [driving, setDriving] = useState(false);
  const [mapView, setMapView] = useState<MapView>({ mode: "search", query: "" });
  const [locationState, setLocationState] = useState("Location not shared");
  const [helpOpen, setHelpOpen] = useState(false);
  const [notice, setNotice] = useState("");
  const [filter, setFilter] = useState("All");
  const [copied, setCopied] = useState(false);
  const [providers, setProviders] = useState<RideSafeProvider[]>([]);
  const [timeTheme, setTimeTheme] = useState<RideSafeTheme>("day");
  const [manualTheme, setManualTheme] = useState<RideSafeTheme | null>(null);
  const [mobilePanelOpen, setMobilePanelOpen] = useState(false);
  const [searchMode, setSearchMode] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [moreSearchesOpen, setMoreSearchesOpen] = useState(false);
  const [recentSearches, setRecentSearches] = useState<RideSafePlace[]>([]);
  const [savedPlaces, setSavedPlaces] = useState<Partial<Record<"home" | "work", RideSafePlace>>>({});
  const [saveNextAs, setSaveNextAs] = useState<"home" | "work" | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const pendingRoute = useRef<{ destination: string; point?: [number, number] } | null>(null);
  const [providerCategory, setProviderCategory] = useState(categories[0].provider);
  const theme = manualTheme ?? timeTheme;
  const tell = (message: string) => { setNotice(message); window.setTimeout(() => setNotice(""), 3500); };

  useEffect(() => {
    try {
      const recent = JSON.parse(localStorage.getItem("ridesafe-recent-searches") ?? "[]") as RideSafePlace[];
      const saved = JSON.parse(localStorage.getItem("ridesafe-saved-places") ?? "{}") as Partial<Record<"home" | "work", RideSafePlace>>;
      setRecentSearches(Array.isArray(recent) ? recent.slice(0, 8) : []);
      setSavedPlaces(saved && typeof saved === "object" ? saved : {});
    } catch { /* Ignore unavailable or invalid local storage. */ }
  }, []);

  useEffect(() => {
    const updateHeight = () => rootRef.current?.style.setProperty("--ridesafe-app-height", `${window.visualViewport?.height ?? window.innerHeight}px`);
    updateHeight();
    window.visualViewport?.addEventListener("resize", updateHeight);
    window.addEventListener("resize", updateHeight);
    return () => { window.visualViewport?.removeEventListener("resize", updateHeight); window.removeEventListener("resize", updateHeight); };
  }, []);

  const rememberSearch = (place: RideSafePlace) => {
    setRecentSearches((current) => {
      const next = [place, ...current.filter((item) => item.address !== place.address)].slice(0, 8);
      try { localStorage.setItem("ridesafe-recent-searches", JSON.stringify(next)); } catch { /* Storage is optional. */ }
      return next;
    });
  };

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
      const selected = { label: place.displayName || name.split(",")[0], address: name, point };
      setQuery(name);
      setMapView({ mode: "search", query: name, point });
      rememberSearch(selected);
      if (saveNextAs) {
        const next = { ...savedPlaces, [saveNextAs]: selected };
        setSavedPlaces(next);
        try { localStorage.setItem("ridesafe-saved-places", JSON.stringify(next)); } catch { /* Storage is optional. */ }
        tell(`${saveNextAs === "home" ? "Home" : "Work"} address saved.`);
        setSaveNextAs(null);
      }
      setSearchMode(false);
      setMobilePanelOpen(true);
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
          setMapView((current) => current.mode === "directions" ? { ...current, origin: point } : { mode: "search", query: "", point });
        }
      },
      (error) => {
        pendingRoute.current = null;
        setLocationState(error.code === error.PERMISSION_DENIED ? "Location permission denied" : "Could not get location");
      },
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 30000 },
    );
  }, []);

  const requestReroute = useCallback((point: [number, number]) => {
    setMapView((current) => current.mode === "directions" ? { ...current, origin: point } : current);
  }, []);

  useEffect(() => { locate(); }, [locate]);

  useEffect(() => {
    if (!driving || !navigator.geolocation) return;
    const watchId = navigator.geolocation.watchPosition(({ coords }) => {
      setPosition([coords.latitude, coords.longitude]);
      setSpeedKph(coords.speed === null ? null : Math.max(0, Math.round(coords.speed * 3.6)));
      setHeading(Number.isFinite(coords.heading) ? coords.heading : null);
      setLocationState("Driving mode · GPS updating");
    }, () => setLocationState("GPS signal lost · trying to reconnect"), { enableHighAccuracy: true, maximumAge: 1000, timeout: 15000 });
    return () => navigator.geolocation.clearWatch(watchId);
  }, [driving]);

  useEffect(() => {
    const updateTheme = () => setTimeTheme(getLocalTimeTheme());
    updateTheme();
    const timer = window.setInterval(updateTheme, 60_000);
    return () => window.clearInterval(timer);
  }, []);

  const openSearch = () => {
    setSearchMode(true);
    setMobilePanelOpen(true);
    window.setTimeout(() => document.querySelector<HTMLInputElement>("#ridesafe-destination")?.focus({ preventScroll: true }), 40);
  };

  const mapSearch = (search: string) => {
    const term = [search, vehicle === "Motorcycle" ? "motorcycle" : vehicle === "EV" ? "electric vehicle" : ""].filter(Boolean).join(" ");
    setMapView({ mode: "search", query: position ? `${term} near ${position[0]},${position[1]}` : term });
    setSearchMode(false);
    setMobilePanelOpen(false);
  };

  const openRoute = (destination = query.trim(), pointOverride?: [number, number]) => {
    if (!destination) { tell("Type a destination and choose a Google Maps suggestion first."); return; }
    const point = pointOverride ?? (mapView.mode === "search" ? mapView.point : undefined);
    rememberSearch({ label: destination.split(",")[0], address: destination, point });
    setQuery(destination);
    setSearchMode(false);
    if (!position) {
      pendingRoute.current = { destination, point };
      tell("Finding your location, then we’ll show your route.");
      locate();
      return;
    }
    setDriving(false);
    setMapView({ mode: "directions", destination, origin: position, point });
    setNavigationStep(null);
    setRouteSummary(null);
    setMobilePanelOpen(true);
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
    <div ref={rootRef} className={`ridesafe-app${searchMode ? " ridesafe-search-mode" : ""}`} data-ridesafe-root="true" data-theme={theme}>
      <main className="app-shell">
        <header className="ridesafe-header">
          <button type="button" className="ridesafe-menu-button" aria-label="Open RideSafe menu" aria-expanded={menuOpen} onClick={() => setMenuOpen(true)}><span /><span /><span /></button>
          <Link href="/ridesafe" className="ridesafe-brand" aria-label="FLAME PH RideSafe home">
            <Image src="/brand/flameph-icon-160.webp" alt="FLAME PH logo" width={42} height={42} priority />
            <span><small>FLAME PH</small><strong>RideSafe</strong></span>
          </Link>
          <div className="header-tools">
            <span className="theme-mode"><span aria-hidden>{theme === "night" ? "☾" : "☼"}</span>{manualTheme ? (theme === "night" ? "Night" : "Day") : "Auto"}</span>
            <button className="theme-toggle" type="button" onClick={() => setManualTheme((current) => current ? null : theme === "night" ? "day" : "night")} aria-label={manualTheme ? "Return to automatic day and night theme" : "Temporarily change map theme"} title={manualTheme ? "Return to automatic theme" : "Change theme temporarily"}>{theme === "night" ? "☾" : "☼"}</button>
            <Link className="account-link" href="/login?next=%2Fridesafe"><span className="account-avatar">M</span><span className="account-link-label">Sign in</span></Link>
          </div>
        </header>
        <div className="workspace" id="home">
          <section className="map-panel" id="ridesafe-map" aria-label="Google Maps">
            <div className="map-topline"><div className="location-label"><span className="pin-small">⌖</span><span><small>GOOGLE MAPS</small><strong>{locationState}</strong></span></div><button className="map-icon-button" aria-label="Use my current location" onClick={locate}>⌖</button></div>
            <RideSafeMap view={mapView} position={position} heading={heading} driving={driving} theme={theme} onRouteSummary={setRouteSummary} onNavigationStep={setNavigationStep} onRerouteRequest={requestReroute} onRequestLocation={locate} />
            {driving && <div className="driving-guidance" aria-live="assertive"><span className="guidance-turn">↱</span><span><small>{navigationStep?.distance ?? "Following your route"}</small><strong>{navigationStep?.instruction ?? `Continue toward ${mapView.mode === "directions" ? mapView.destination : "your destination"}`}</strong></span></div>}
            {driving && <div className="driving-speed" aria-label={speedKph === null ? "Speed unavailable" : `Speed ${speedKph} kilometres per hour`}><strong>{speedKph ?? "—"}</strong><small>km/h</small></div>}
            {driving && <button type="button" className="driving-end-trip" onClick={() => { setDriving(false); setSpeedKph(null); setLocationState("Your location · just now"); setMobilePanelOpen(true); }}>End trip</button>}
            <div className="map-footer"><span><span className="live-dot" /> Google Maps · in RideSafe</span><span className="map-provider-note">Route and place data by Google</span></div>
          </section>

          <aside className={`side-panel ${mobilePanelOpen ? "sheet-open" : "sheet-collapsed"}${driving ? " trip-driving" : ""}`}>
            <button type="button" className="sheet-grabber" onClick={() => setMobilePanelOpen((open) => !open)} aria-label={mobilePanelOpen ? "Collapse search panel" : "Expand search panel"}><span /></button>
            <section className="welcome"><div><span className="eyebrow">YOUR ROAD COMPANION</span><h1>Where are you<br />headed today?</h1><p>Plan a route or find help nearby.</p></div><span className="sun-mark">✳</span></section>
            <button type="button" className="search-back" onClick={() => { setSearchMode(false); setMobilePanelOpen(false); }} aria-label="Back to map">‹</button>
            <form className="trip-search" onSubmit={(event) => { event.preventDefault(); openRoute(); }}>
              <label className="search-box"><span>⌕</span><input id="ridesafe-destination" autoComplete="off" value={query} onFocus={() => { setMobilePanelOpen(true); setSearchMode(true); }} onChange={(event) => setQuery(event.target.value)} onKeyDown={(event) => { if (event.key === "Escape") setSuggestions([]); if (event.key === "Enter" && suggestions[0]) { event.preventDefault(); void chooseDestination(suggestions[0]); } }} placeholder="Where to?" aria-label="Trip destination" aria-autocomplete="list" aria-controls="ridesafe-suggestions" /><button type="submit" aria-label="Plan route">→</button></label>
              {(suggestions.length > 0 || searching) && <div className="autocomplete-results" id="ridesafe-suggestions" role="listbox" aria-label="Google Maps suggestions">{searching && <p className="autocomplete-loading">Searching Google Maps…</p>}{suggestions.map((suggestion) => <button type="button" role="option" aria-selected="false" key={suggestion.placeId} onClick={() => void chooseDestination(suggestion)}><span className="suggest-pin">⌖</span><span><strong>{suggestion.mainText?.text ?? suggestion.text.toString()}</strong><small>{suggestion.secondaryText?.text ?? "Google Maps place"}</small></span></button>)}</div>}
              {!process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY && <p className="api-key-hint">Google Maps suggestions will activate when the Maps API key is configured.</p>}
              <div className="route-actions"><small>Choose a Google Maps suggestion for the best match</small><button type="submit">Show driving route <span>↑</span></button></div>
            </form>
            <section className="destination-tools" aria-label="Places and recent destinations">
              {query.trim().length > 0 && <div className="quick-place-row">
                {[{ name: "Saved", icon: "▣", action: () => document.querySelector("#ridesafe-saved-places")?.scrollIntoView({ block: "nearest" }) }, { name: "Crisis", icon: "⌂", action: () => setHelpOpen(true) }, { name: "Gas", icon: "⛽", action: () => mapSearch("gas station") }, { name: "Food", icon: "♨", action: () => mapSearch("restaurant") }, { name: "Parking", icon: "P", action: () => mapSearch("parking") }, ...(moreSearchesOpen ? [{ name: "Hospitals", icon: "+", action: () => mapSearch("hospital") }, { name: "Towing", icon: "↗", action: () => mapSearch("towing service") }, { name: "Charging", icon: "ϟ", action: () => mapSearch("EV charging station") }] : [])].map((item) => <button type="button" className="quick-place" key={item.name} onClick={item.action}><span>{item.icon}</span><small>{item.name}</small></button>)}
                <button type="button" className="quick-place quick-more" onClick={() => setMoreSearchesOpen((open) => !open)}><span>{moreSearchesOpen ? "−" : "•••"}</span><small>{moreSearchesOpen ? "Less" : "More"}</small></button>
              </div>}
              <div className="saved-place-list" id="ridesafe-saved-places">
                {(["home", "work"] as const).map((key) => <button type="button" className="destination-row" key={key} onClick={() => savedPlaces[key] ? openRoute(savedPlaces[key]!.address, savedPlaces[key]!.point) : (setSaveNextAs(key), setQuery(""), tell(`Search for your ${key} address, then choose a result to save it.`), window.setTimeout(() => document.querySelector<HTMLInputElement>("#ridesafe-destination")?.focus({ preventScroll: true }), 40))}><span className="destination-icon">{key === "home" ? "⌂" : "▣"}</span><span><strong>{savedPlaces[key]?.label ?? (key === "home" ? "Home" : "Work")}</strong><small>{savedPlaces[key]?.address ?? `Tap to add your ${key} address`}</small></span>{!savedPlaces[key] && <b>+</b>}</button>)}
              </div>
              <div className="recent-search-list"><div className="recent-heading"><span>Recent</span>{recentSearches.length > 0 && <button type="button" onClick={() => { setRecentSearches([]); localStorage.removeItem("ridesafe-recent-searches"); }}>Clear</button>}</div>
                {recentSearches.length ? recentSearches.map((place) => <button type="button" className="destination-row" key={place.address} onClick={() => openRoute(place.address, place.point)}><span className="destination-icon">◷</span><span><strong>{place.label}</strong><small>{place.address}</small></span><span className="destination-arrow">→</span></button>) : <p className="empty-recents">Destinations you choose will appear here.</p>}
              </div>
            </section>
            {mapView.mode === "directions" && <section className="route-card" aria-live="polite">
              <div className="route-card-copy"><span className="route-icon">↗</span><div><strong>{routeSummary ? `${routeSummary.distance} · ${routeSummary.duration}` : "Preparing your driving route…"}</strong><small>{driving ? "Driving mode is on · follow your route on the map" : `To ${mapView.destination}`}</small></div></div>
              {driving
                ? <button type="button" className="route-end" onClick={() => { setDriving(false); setSpeedKph(null); setLocationState("Your location · just now"); setMobilePanelOpen(true); }}>End trip</button>
                : <button type="button" className="route-start" disabled={!routeSummary || !position} onClick={() => { if (!position) { tell("Allow location access to start driving mode."); locate(); return; } setMobilePanelOpen(false); setDriving(true); setLocationState("Driving mode · location updating"); }}>Start Driving <span>→</span></button>}
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

        <nav className="ridesafe-dock" aria-label="RideSafe navigation">
          <button type="button" className="dock-item dock-active" onClick={() => setMobilePanelOpen(false)}><span aria-hidden>⌖</span><small>Map</small></button>
          <button type="button" className="dock-item" onClick={openSearch}><span aria-hidden>⌕</span><small>Search</small></button>
          <button type="button" className="dock-item" onClick={() => { setMobilePanelOpen(true); window.setTimeout(() => document.querySelector<HTMLInputElement>("#ridesafe-destination")?.focus({ preventScroll: true }), 40); }}><span aria-hidden>⌁</span><small>Plan a drive</small></button>
          <button type="button" className="dock-help" onClick={() => setHelpOpen(true)}><span className="dock-help-icon" aria-hidden>!</span><span>I need help</span></button>
          <Link className="dock-item" href="/login?next=%2Fridesafe"><span aria-hidden>◉</span><small>Me</small></Link>
        </nav>
        <footer className="ridesafe-legal"><span>FLAME PH RideSafe</span><span>Information may be unverified · Emergency? Call 911</span></footer>
        {notice && <div className="toast" role="status">{notice}</div>}
        {menuOpen && <div className="ridesafe-menu-backdrop" onClick={() => setMenuOpen(false)}><nav className="ridesafe-menu" aria-label="RideSafe menu" onClick={(event) => event.stopPropagation()}><div className="ridesafe-menu-top"><span><small>FLAME PH</small><strong>RideSafe</strong></span><button type="button" onClick={() => setMenuOpen(false)} aria-label="Close menu">×</button></div><button type="button" onClick={() => { setMenuOpen(false); openSearch(); }}>⌕ <span>Plan a drive</span></button><button type="button" onClick={() => { setMenuOpen(false); openSearch(); document.querySelector("#ridesafe-saved-places")?.scrollIntoView({ block: "nearest" }); }}>▣ <span>Saved places</span></button><button type="button" onClick={() => { setMenuOpen(false); setManualTheme(null); tell("Automatic day and night display is on."); }}>☼ <span>Display and map theme</span></button><button type="button" onClick={() => { setMenuOpen(false); setHelpOpen(true); }}>? <span>Help and feedback</span></button><Link href="/ridesafe/providers/apply" onClick={() => setMenuOpen(false)}>✦ <span>Join as a business</span></Link><Link href="/login?next=%2Fridesafe" onClick={() => setMenuOpen(false)}>◉ <span>FLAME PH account</span></Link></nav></div>}
        {helpOpen && <div className="modal-backdrop" onClick={() => setHelpOpen(false)}><section className="help-modal" role="dialog" aria-modal="true" aria-labelledby="help-title" onClick={(event) => event.stopPropagation()}><button className="close-modal" onClick={() => setHelpOpen(false)} aria-label="Close">×</button><span className="eyebrow">WE’RE HERE WITH YOU</span><h2 id="help-title">Is anyone hurt<br />or in danger?</h2><p>If someone is in immediate danger, contact emergency services now.</p><a className="call-911" href="tel:911"><span>Call 911</span><b>↗</b></a><button className="vehicle-help" onClick={() => { setHelpOpen(false); mapSearch(vehicle === "EV" ? "EV capable roadside assistance flatbed towing" : "roadside assistance near me"); }}>Find roadside help nearby <span>→</span></button><button className="vehicle-help share-location" onClick={shareLocation}>{copied ? "Location copied" : "Share my location"}<span>↗</span></button><div className="emergency-coordinates">{position ? `Map point: ${position[0].toFixed(5)}, ${position[1].toFixed(5)}` : "Allow location to share your coordinates."}</div><small className="modal-footnote">RideSafe helps you find help. It is not an emergency service.</small></section></div>}
      </main>
    </div>
  );
}
