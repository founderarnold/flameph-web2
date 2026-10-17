type MapView =
  | { mode: "search"; query: string }
  | { mode: "directions"; destination: string; origin: [number, number] | null };

export default function RideSafeMap({ view }: { view: MapView }) {
  const params = new URLSearchParams({ output: "embed", hl: "en" });
  if (view.mode === "directions") {
    if (view.origin) params.set("saddr", `${view.origin[0]},${view.origin[1]}`);
    params.set("daddr", view.destination);
  } else params.set("q", view.query);

  return <div className="ridesafe-map-wrap">
    <iframe
      key={params.toString()}
      className="ridesafe-google-map"
      src={`https://www.google.com/maps?${params.toString()}`}
      title={view.mode === "directions" ? `Google Maps directions to ${view.destination}` : `Google Maps: ${view.query}`}
      loading="lazy"
      allowFullScreen
      referrerPolicy="strict-origin-when-cross-origin"
    />
  </div>;
}
