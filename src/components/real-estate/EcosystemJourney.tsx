const STEPS = [
  { name: "PEOPLE", powered: "FLAME PH", text: "Community, education, chapters, mentors and partnerships.", color: "bg-flame-soft text-flame-strong" },
  { name: "BUSINESS", powered: "NegosyoDepot", text: "Business opportunities, startup resources and enterprise solutions.", color: "bg-warn-soft text-warn" },
  { name: "PLACE", powered: "Mapiles Realty Corporate H", text: "Property and location solutions for operations, investment and expansion.", color: "bg-ok-soft text-ok" },
  { name: "TECHNOLOGY", powered: "FLAME AI + Digital Tools", text: "AI guidance, POS, business pages and digitalization tools.", color: "bg-primary-soft text-primary" },
  { name: "MARKET", powered: "MarketplacePH", text: "Visibility, digital commerce and wider market access.", color: "bg-primary-soft text-mph" },
];

export function EcosystemJourney() {
  return (
    <section className="border-y border-line bg-bg-soft" aria-labelledby="ecosystem-journey-title">
      <div className="container-x py-12 lg:py-16">
        <p className="text-sm font-extrabold uppercase tracking-[.16em] text-flame-strong">The FLAME PH MSME Ecosystem</p>
        <h2 id="ecosystem-journey-title" className="mt-2 text-2xl font-extrabold sm:text-3xl">One ecosystem. Five things every business needs.</h2>
        <div className="mt-7 grid gap-3 lg:grid-cols-5">
          {STEPS.map((step, index) => (
            <article key={step.name} className="card relative p-5">
              <span className={`inline-flex rounded-full px-3 py-1 text-xs font-extrabold ${step.color}`}>{step.name}</span>
              <h3 className="mt-4 font-extrabold text-primary">{step.powered}</h3>
              <p className="mt-2 text-sm text-muted">{step.text}</p>
              {index < STEPS.length - 1 && <span aria-hidden className="absolute -right-3 top-1/2 z-10 hidden text-xl font-bold text-muted lg:block">→</span>}
            </article>
          ))}
        </div>
        <p className="mt-7 text-center font-extrabold text-primary">Start Small → Grow Locally → Scale Globally</p>
      </div>
    </section>
  );
}
