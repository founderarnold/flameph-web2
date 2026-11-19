import Link from "next/link";

/** Tabs for Admin → Privacy and security (Phase 12). */
export function PrivacyNav({ here }: { here: "requests" | "incidents" | "security" }) {
  const tab = (k: typeof here, href: string, label: string) => <Link href={href} aria-current={here === k ? "page" : undefined} className={`rounded-full px-3 py-2 text-sm font-semibold ${here === k ? "bg-primary text-white" : "bg-bg-soft"}`}>{label}</Link>;
  return <nav aria-label="Privacy and security" className="flex flex-wrap gap-2">{tab("requests", "/admin/privacy", "Members' requests")}{tab("incidents", "/admin/privacy/incidents", "Breaches (72 hours)")}{tab("security", "/admin/privacy/security", "Security, abuse and retention")}</nav>;
}
