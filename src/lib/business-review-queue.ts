// Which business listings Admin > Directory verification shows by default ("waiting"), and how each is labelled.
// Before this, the default view showed only listings with documents to check, so listings sent for approval
// (lifecycle "submitted") and new listings still in "draft" never appeared, and nobody could approve them.

/** PostgREST filter: documents waiting, submitted for approval, or a new listing the owner has not submitted yet. */
export const WAITING_FILTER = "verification_status.eq.pending,lifecycle_status.in.(submitted,draft)";

type Row = { published?: boolean | null; lifecycle_status?: string | null; risk_level?: string | null };

/** A short line for a listing that is not public yet and can be approved, or null. */
export function waitingLabel(b: Row): string | null {
  if (b.published || b.risk_level === "high") return null;
  if (b.lifecycle_status === "submitted") return "Waiting for approval: the owner submitted this listing.";
  if (b.lifecycle_status === "draft") return "Not public yet: the owner saved this listing but has not pressed Submit for review. You can still approve it.";
  return null;
}
