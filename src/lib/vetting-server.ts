import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

// Deleting vetting documents: the encrypted file first, then the row is marked deleted (the row stays as a record of
// what was sent and when, without the file). Uses the server key; callers check who may do it.

export const VETTING_BUCKET = "private-docs";
type Reason = "retention" | "consent_withdrawn" | "member_removed";

export async function purgeDocs(admin: SupabaseClient, rows: { id: string; file_path: string }[], reason: Reason): Promise<number> {
  if (!rows.length) return 0;
  const { error } = await admin.storage.from(VETTING_BUCKET).remove(rows.map((r) => r.file_path));
  if (error) return 0;
  const { error: e2 } = await admin.from("vetting_documents").update({ deleted_at: new Date().toISOString(), delete_reason: reason }).in("id", rows.map((r) => r.id));
  return e2 ? 0 : rows.length;
}

/** All of one member's documents (they turned off switch 4). */
export async function purgeMemberDocs(admin: SupabaseClient, userId: string, reason: Reason = "consent_withdrawn") {
  const { data } = await admin.from("vetting_documents").select("id, file_path").eq("user_id", userId).is("deleted_at", null).limit(100);
  return purgeDocs(admin, (data ?? []) as { id: string; file_path: string }[], reason);
}

/** Everything past its retention date or whose member withdrew consent (daily, from the scheduler). */
export async function purgeDueDocs(admin: SupabaseClient) {
  const { data, error } = await admin.rpc("vetting_documents_due");
  if (error) return { deleted: 0, error: error.message };
  const rows = (data ?? []) as { id: string; file_path: string; reason: Reason }[];
  let deleted = 0;
  for (const reason of ["retention", "consent_withdrawn"] as const) deleted += await purgeDocs(admin, rows.filter((r) => r.reason === reason).slice(0, 500), reason);
  return { deleted, error: null };
}
