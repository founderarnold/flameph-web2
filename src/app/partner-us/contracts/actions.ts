"use server";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/server";
import { sendEmail, NOTIFY_TO } from "@/lib/email";
import { ORG } from "@/lib/site";
import { nameMatches } from "@/lib/contracts";

// The partner's side of a contract (Step 8): sign it electronically (when electronic signing is on) or ask for changes.
// The server checks that the signed-in member is the contract's partner and that the text they read is the text in
// the database (same fingerprint); the database checks the same rules again (0038).

const HOME = "/partner-us/contracts";
const uuid = (v: unknown) => (typeof v === "string" && /^[0-9a-f-]{36}$/i.test(v) ? v : null);

async function mine(id: string | null) {
  const { user } = await requireUser(HOME);
  if (!id) redirect(HOME);
  const admin = createAdminClient();
  if (!admin) redirect(`${HOME}?error=unavailable`);
  const { data: c } = await admin!.from("partner_contracts").select("id, ref_no, partner_user_id, partner_name, status, revision, body_sha256, signatory_name, first_sent_at").eq("id", id!).maybeSingle();
  if (!c || c.partner_user_id !== user.id || !c.first_sent_at) redirect(HOME);
  return { user, admin: admin!, c: c! as { id: string; ref_no: string; partner_user_id: string; partner_name: string; status: string; revision: number; body_sha256: string | null; signatory_name: string | null } };
}
const team = (subject: string, text: string, id: string) => sendEmail({ to: NOTIFY_TO, subject, text: `${text}\n\n${ORG.url}/admin/partners/contracts/${id}` });

/** The partner's electronic signature. */
export async function partnerSign(fd: FormData) {
  const { user, admin, c } = await mine(uuid(fd.get("id")));
  const page = `${HOME}/${c.id}`;
  if (c.status !== "out_for_signing") redirect(`${page}?error=move#sign`);
  if (String(fd.get("sha")) !== c.body_sha256 || Number(fd.get("revision")) !== c.revision) redirect(`${page}?error=changed#sign`);
  if (fd.get("consent") !== "on" || fd.get("authority") !== "on") redirect(`${page}?error=consent#sign`);
  const typed = String(fd.get("typed_name") ?? "").slice(0, 120);
  if (!nameMatches(typed, c.signatory_name)) redirect(`${page}?error=name#sign`);
  const { data: on } = await admin.rpc("contract_esign_on");
  if (on !== true) redirect(`${page}?error=esign_off#sign`);
  const h = await headers();
  const { error } = await admin.from("partner_contract_signatures").insert({
    contract_id: c.id, revision: c.revision, side: "partner", method: "electronic", signer_user_id: user.id, signer_name: "-", signer_position: "-",
    typed_name: typed, authority_confirmed: true, consent_esign: true, body_sha256: c.body_sha256,
    ip: (h.get("x-forwarded-for") || h.get("x-real-ip") || "").split(",")[0].trim().slice(0, 64) || null, user_agent: (h.get("user-agent") || "").slice(0, 300) || null,
  });
  if (error) redirect(`${page}?error=${/name/.test(error.message) ? "name" : /electronic signing is off/.test(error.message) ? "esign_off" : /text changed/.test(error.message) ? "changed" : "failed"}#sign`);
  await admin.from("audit_log").insert({ actor_id: user.id, action: "partner_contract_partner_signed", table_name: "partner_contracts", row_id: c.id, detail: { revision: c.revision } });
  await team(`Partner signed contract ${c.ref_no}: ${c.partner_name}`, "The partner signed electronically. The founder signs next for FLAME (Admin > Partners > Contracts).", c.id);
  revalidatePath(HOME); revalidatePath(page); revalidatePath(`/admin/partners/contracts/${c.id}`);
  redirect(`${page}?done=signed_partner`);
}

/** The partner asks for changes before signing: the contract goes back to the team as a new version. */
export async function askChanges(fd: FormData) {
  const { user, admin, c } = await mine(uuid(fd.get("id")));
  const page = `${HOME}/${c.id}`;
  if (c.status !== "out_for_signing") redirect(`${page}?error=move#changes`);
  const reason = String(fd.get("reason") ?? "").trim().slice(0, 1000);
  if (reason.length < 5) redirect(`${page}?error=reason#changes`);
  const { error } = await admin.from("partner_contracts").update({ status: "draft", changed_by: user.id, status_reason: reason }).eq("id", c.id).eq("status", "out_for_signing");
  if (error) redirect(`${page}?error=failed#changes`);
  await admin.from("partner_contract_history").insert({ contract_id: c.id, actor_id: user.id, action: "changes_asked", note: reason });
  await team(`Changes asked on contract ${c.ref_no}: ${c.partner_name}`, `The partner asked for changes before signing:\n\n${reason}`, c.id);
  revalidatePath(HOME); revalidatePath(page); revalidatePath(`/admin/partners/contracts/${c.id}`);
  redirect(`${page}?done=changes_asked`);
}
