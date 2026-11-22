import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/server";
import { sendEmail } from "@/lib/email";
import { ORG } from "@/lib/site";
import { decryptDoc, encryptDoc, vettingKey } from "@/lib/vetting-crypto";
import { tinDigits } from "@/lib/partner";

// Server-only partner helpers. The TIN is encrypted with the same server key as vetting documents (AES-256-GCM), so it
// never sits in the database as plain digits and no browser role can read even the encrypted value (0031 grants).

export type Role = string;
export const REVIEWER_ROLES = ["super_admin", "admin", "national_reviewer"] as const;
export const isReviewer = (roles: Role[]) => roles.some((r) => (REVIEWER_ROLES as readonly string[]).includes(r));

/** Encrypted TIN plus the last 3 digits of the 9-digit TIN (shown back to the applicant as •••-•••-123). */
export function sealTin(raw: string): { tin_enc: string; tin_key_id: string; tin_last3: string } | null {
  const k = vettingKey();
  if (!k) return null;
  const d = tinDigits(raw);
  return { tin_enc: encryptDoc(Buffer.from(d, "utf8"), k.key).toString("base64"), tin_key_id: k.id, tin_last3: d.slice(6, 9) };
}

export function openTin(enc: string | null, keyId: string | null): string | null {
  const k = vettingKey();
  if (!enc || !k || keyId !== k.id) return null;
  try {
    const d = decryptDoc(Buffer.from(enc, "base64"), k.key).toString("utf8");
    return d.replace(/^(\d{3})(\d{3})(\d{3})(\d{3})?$/, (_m, a, b, c, e) => [a, b, c, e].filter(Boolean).join("-"));
  } catch { return null; }
}

/** One line in the applicant's Inbox (Workspace → Inbox) and an email. A decision on their application is a service
 *  message, so it is sent whatever their marketing choices are. Never throws. */
export async function tellApplicant(userId: string, title: string, body: string, url: string, subject = "FLAME PH partner application") {
  const admin = createAdminClient();
  if (!admin) return;
  try {
    await admin.from("member_notifications").insert({ user_id: userId, kind: "notice", title: title.slice(0, 140), body: body.slice(0, 300), url });
    const { data } = await admin.auth.admin.getUserById(userId);
    const to = data.user?.email;
    if (to) await sendEmail({ to: [to], subject: `${subject}: ${title}`, text: `${body}\n\nOpen it here: ${ORG.url}${url}\n\n—\nFLAME PH Partner Accreditation. This is a message about your own application or offer.` });
  } catch { /* the in-app notice is enough */ }
}

/** Total size of a member's partner files that still exist, application documents and Best Offer files together (the 50 MB cap). */
export async function partnerBytes(admin: SupabaseClient, userId: string): Promise<number> {
  const { data } = await admin.from("vetting_documents").select("size_bytes").eq("user_id", userId).in("purpose", ["partner", "offer"]).is("deleted_at", null).limit(500);
  return (data ?? []).reduce((n, r) => n + (Number(r.size_bytes) || 0), 0);
}

/** The application fields frozen in the history at each send (no encrypted TIN). */
export const SNAPSHOT_COLUMNS = "category, revision, legal_name, trade_name, registration_type, registration_no, tin_last3, industry, website, rep_name, rep_position, biz_email, biz_phone, address_line, city, province, coverage, coverage_areas, details";
