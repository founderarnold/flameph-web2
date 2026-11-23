"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/server";
import { sendEmail, NOTIFY_TO } from "@/lib/email";
import { ORG } from "@/lib/site";
import { MAX_OPEN_NOMINATIONS } from "@/lib/territory";

// The partner's side of territories: they can only NOMINATE a sub-partner inside their own active appointment, or
// withdraw a nomination. They never appoint anyone. Checked here as the member (row level security), then written
// with the server key; the database checks the same rules again (0033).

const HOME = "/partner-us/territories";
const uuid = (v: unknown) => (typeof v === "string" && /^[0-9a-f-]{36}$/i.test(v) ? v : null);
const str = (fd: FormData, k: string, max: number) => String(fd.get(k) ?? "").trim().replace(/\s+/g, " ").slice(0, max) || null;
const go = (q: string, hash = ""): never => redirect(`${HOME}?${q}${hash}`);

export async function nominateSubPartner(fd: FormData) {
  const { supabase, user } = await requireUser(HOME);
  const parentId = uuid(fd.get("parent_id"));
  if (!parentId) go("error=failed");
  const { data: parent } = await supabase.from("territorial_appointments").select("id, partner_user_id, parent_id, status, category_label").eq("id", parentId!).maybeSingle();
  if (!parent || parent.partner_user_id !== user.id || parent.status !== "active" || parent.parent_id) go("error=not_yours");
  const hash = `#nominate-${parentId}`;
  const row = {
    nominator_id: user.id, parent_id: parentId,
    nominee_name: str(fd, "nominee_name", 200), nominee_contact: str(fd, "nominee_contact", 120),
    nominee_phone: str(fd, "nominee_phone", 40), nominee_email: str(fd, "nominee_email", 200),
    proposed_area: str(fd, "proposed_area", 500), reason: String(fd.get("reason") ?? "").trim().slice(0, 1000) || null,
    nominee_agreed: fd.get("nominee_agreed") === "yes",
  };
  if (!row.nominee_name || row.nominee_name.length < 2 || !row.nominee_contact || !row.proposed_area || row.proposed_area.length < 2) go("error=missing", hash);
  if (!row.nominee_phone && !row.nominee_email) go("error=contact", hash);
  if (row.nominee_email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(row.nominee_email)) go("error=email", hash);
  if (!row.reason || row.reason.length < 10) go("error=reason", hash);
  if (!row.nominee_agreed) go("error=agreed", hash);
  const { count } = await supabase.from("territory_nominations").select("id", { count: "exact", head: true }).eq("nominator_id", user.id).eq("status", "submitted");
  if ((count ?? 0) >= MAX_OPEN_NOMINATIONS) go("error=limit", hash);
  const admin = createAdminClient();
  if (!admin) go("error=unavailable");
  const { data: made, error } = await admin!.from("territory_nominations").insert(row).select("id").single();
  if (error || !made) go("error=failed", hash);
  await admin!.from("audit_log").insert({ actor_id: user.id, action: "territory_nomination_sent", table_name: "territory_nominations", row_id: made!.id, detail: { parent: parentId } });
  await sendEmail({
    to: NOTIFY_TO, subject: `Sub-partner nomination: ${row.nominee_name} (${parent!.category_label})`,
    text: `A partner nominated a sub-partner inside their territory. Only the national team decides.\n\nOpen it in Admin > Partners > Territories > Sub-partner nominations: ${ORG.url}/admin/partners/territories/nominations`,
  });
  revalidatePath(HOME); revalidatePath("/admin/partners/territories/nominations");
  go("done=nominated", "#nominations");
}

export async function withdrawNomination(fd: FormData) {
  const { supabase, user } = await requireUser(HOME);
  const id = uuid(fd.get("id"));
  if (!id) go("error=failed");
  const { data: n } = await supabase.from("territory_nominations").select("id, nominator_id, status").eq("id", id!).maybeSingle();
  if (!n || n.nominator_id !== user.id || n.status !== "submitted") go("error=failed", "#nominations");
  const admin = createAdminClient();
  if (!admin) go("error=unavailable");
  const { error } = await admin!.from("territory_nominations").update({ status: "withdrawn" }).eq("id", id!).eq("status", "submitted");
  if (error) go("error=failed", "#nominations");
  await admin!.from("audit_log").insert({ actor_id: user.id, action: "territory_nomination_withdrawn", table_name: "territory_nominations", row_id: id });
  revalidatePath(HOME);
  go("done=withdrawn", "#nominations");
}
