export type Status = "live" | "beta" | "soon";

const STYLES: Record<Status, string> = {
  live: "bg-ok-soft text-ok border-ok/30",
  beta: "bg-primary-soft text-primary border-primary/30",
  soon: "bg-warn-soft text-warn border-warn/30",
};
const LABELS: Record<Status, string> = { live: "Live", beta: "Beta", soon: "Coming soon" };

export function StatusBadge({ status, className = "" }: { status: Status; className?: string }) {
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-bold uppercase tracking-wide ${STYLES[status]} ${className}`}>
      <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-current" />
      {LABELS[status]}
    </span>
  );
}
