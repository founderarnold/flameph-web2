// Which business listings Admin > Directory verification shows, and how each is labelled.
// Before this, the default view showed only listings with documents to check, so listings sent for approval
// (lifecycle "submitted") and new listings still in "draft" never appeared, and nobody could approve them.
// Since 25 Nov 2026 normal listings publish on their own (src/lib/listing-auto-review.ts); the page opens on
// "Needs a look", the listings the automatic check held back, with Next / Back / First page paging.

/** PostgREST filter: documents waiting, submitted for approval, held by the automatic check, or a draft. */
export const WAITING_FILTER = "verification_status.eq.pending,lifecycle_status.in.(submitted,draft,pending_review)";

type Row = { published?: boolean | null; lifecycle_status?: string | null; risk_level?: string | null };

/** A short line for a listing that is not public yet and can be approved, or null. */
export function waitingLabel(b: Row): string | null {
  if (b.published || b.risk_level === "high") return null;
  if (b.lifecycle_status === "submitted") return "Waiting for approval: the owner submitted this listing.";
  if (b.lifecycle_status === "pending_review") return "Held by the automatic check. Read the reasons, then approve or ask the owner to correct.";
  if (b.lifecycle_status === "needs_correction") return "Waiting for the owner to correct this listing. You can still approve it.";
  if (b.lifecycle_status === "draft") return "Not public yet: the owner saved this listing but it has not been checked. You can approve it now.";
  return null;
}

export type DirectoryView = "review" | "docs" | "flagged" | "live" | "off" | "all";

/** The tabs, in order. `filter` is applied to a PostgREST query on businesses. */
export const DIRECTORY_VIEWS: { key: DirectoryView; label: string; help: string }[] = [
  { key: "review", label: "Needs a look", help: "Not public yet. The automatic check held these back, or they have not been checked." },
  { key: "docs", label: "Documents to check", help: "Members who sent papers for the Verified badge. Optional: their listing can be public already." },
  { key: "flagged", label: "High suspicion", help: "Random-letter or spam listings, including the older listings from the 30 Oct safety check. Never published automatically." },
  { key: "live", label: "On the directory", help: "Public now on the business directory." },
  { key: "off", label: "Hidden or rejected", help: "Hidden, rejected or suspended by an admin, or the owner's account is not active." },
  { key: "all", label: "All listings", help: "Every listing." },
];

type Filterable = { eq(c: string, v: unknown): Filterable; neq(c: string, v: unknown): Filterable; in(c: string, v: unknown[]): Filterable };

/** Narrows a Supabase query on businesses to one tab. Typed loosely on purpose (the builder's types are very deep). */
export function applyView<T>(query: T, view: DirectoryView): T {
  const q = query as unknown as Filterable;
  const out = (() => {
    switch (view) {
      case "review": return q.eq("published", false).neq("risk_level", "high").in("lifecycle_status", ["draft", "submitted", "pending_review", "needs_correction"]);
      case "docs": return q.eq("verification_status", "pending");
      case "flagged": return q.eq("risk_level", "high");
      case "live": return q.eq("published", true);
      case "off": return q.eq("published", false).neq("risk_level", "high").in("lifecycle_status", ["approved", "rejected", "suspended"]);
      default: return q;
    }
  })();
  return out as unknown as T;
}

export const viewOf = (v: unknown, all?: unknown): DirectoryView =>
  DIRECTORY_VIEWS.some((x) => x.key === v) ? (v as DirectoryView) : all ? "all" : "review";

export const PAGE_SIZE = 20;

/** Page numbers for the pager: 1-based page, total rows -> first/last row shown and the last page. */
export function pageInfo(page: number, total: number, size = PAGE_SIZE) {
  const last = Math.max(1, Math.ceil(total / size));
  const current = Math.min(Math.max(1, Math.floor(page) || 1), last);
  const from = total === 0 ? 0 : (current - 1) * size + 1;
  const to = Math.min(total, current * size);
  return { current, last, from, to, hasPrev: current > 1, hasNext: current < last };
}
