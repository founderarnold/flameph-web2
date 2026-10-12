// Illustration of the FLAME Principle: costs shared across a group. Not data; no numbers.
export function PrincipleDiagram() {
  return (
    <figure className="card overflow-hidden bg-card p-4">
      <svg viewBox="0 0 520 260" role="img" aria-labelledby="pd-title" className="h-auto w-full">
        <title id="pd-title">Illustration: one business carrying a full cost alone, compared with many businesses sharing the same cost.</title>
        <g fontFamily="inherit" fontSize="14" fill="currentColor">
          <text x="110" y="24" textAnchor="middle" fontWeight="700">Mag-isa</text>
          <rect x="80" y="44" width="60" height="150" rx="8" fill="var(--flame-soft)" stroke="var(--flame)" strokeWidth="2" />
          <text x="110" y="124" textAnchor="middle" fill="var(--flame-strong)" fontWeight="700">Gastos</text>
          <circle cx="110" cy="222" r="16" fill="var(--primary)" />
          <text x="390" y="24" textAnchor="middle" fontWeight="700">Sama-sama</text>
          <rect x="300" y="154" width="180" height="40" rx="8" fill="var(--flame-soft)" stroke="var(--flame)" strokeWidth="2" />
          <text x="390" y="179" textAnchor="middle" fill="var(--flame-strong)" fontWeight="700">Hating gastos</text>
          {[318, 354, 390, 426, 462].map((x) => <circle key={x} cx={x} cy="222" r="14" fill="var(--primary)" />)}
          <path d="M200 120h60" stroke="var(--fg-muted)" strokeWidth="2" markerEnd="url(#arr)" />
        </g>
        <defs><marker id="arr" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="8" markerHeight="8" orient="auto"><path d="M0 0l10 5-10 5z" fill="var(--fg-muted)" /></marker></defs>
      </svg>
      <figcaption className="mt-2 text-center text-sm text-muted">Illustration only</figcaption>
    </figure>
  );
}
