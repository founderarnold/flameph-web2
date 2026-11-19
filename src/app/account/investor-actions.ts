"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { requireModerator } from "@/lib/moderation-data";
import { isMemberType, isRegulator } from "@/lib/investor";

// Phase 10B. Profile type and the investor's registration or licence. The database does the checks (0026);
// these only pass the member's choice along. No amount of money is ever taken or stored here.

const s = (v: FormDataEntryValue | null, max = 160) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const code = (m?: string) => (m && /not_investor/.test(m) ? "not_investor" : m && /member_type|investor_registration|schema cache|does not exist/.test(m) ? "unavailable" : "failed");

export async function saveMemberType(fd: FormData) {
  const { supabase, user } = await requireUser("/account/profile");
  const type = s(fd.get("member_type"), 40);
  if (!isMemberType(type)) redirect("/account/profile?investor_error=failed#profile-type");
  const { error } = await supabase.from("profiles").update({ member_type: type }).eq("id", user.id);
  if (error) redirect(`/account/profile?investor_error=${code(error.message)}#profile-type`);
  revalidatePath("/account/profile");
  redirect("/account/profile?investor_done=type#profile-type");
}

export async function saveRegistration(fd: FormData) {
  const { supabase } = await requireUser("/account/profile");
  const regulator = s(fd.get("regulator"), 10);
  const name = s(fd.get("registered_name"));
  const number = s(fd.get("reg_number"), 60);
  if (!isRegulator(regulator) || name.length < 2 || number.length < 2) redirect("/account/profile?investor_error=fields#registration");
  const { error } = await supabase.rpc("investor_registration_submit", { p_regulator: regulator, p_name: name, p_number: number });
  if (error) redirect(`/account/profile?investor_error=${code(error.message)}#registration`);
  revalidatePath("/account/profile");
  redirect("/account/profile?investor_done=registration#registration");
}

export async function removeRegistration() {
  const { supabase } = await requireUser("/account/profile");
  const { error } = await supabase.rpc("investor_registration_remove");
  if (error) redirect(`/account/profile?investor_error=${code(error.message)}#registration`);
  revalidatePath("/account/profile");
  redirect("/account/profile?investor_done=removed#registration");
}

/** Admins and the founder record what they saw on the regulator's public list. Logged in the moderation audit log. */
export async function decideRegistration(fd: FormData) {
  const { supabase } = await requireModerator("/admin/investors", 2);
  const userId = s(fd.get("user_id"), 40);
  const seen = s(fd.get("seen"), 5) === "yes";
  const note = s(fd.get("note"), 300);
  if (!/^[0-9a-f-]{36}$/i.test(userId)) redirect("/admin/investors?error=failed");
  const { error } = await supabase.rpc("investor_registration_decide", { p_user: userId, p_seen: seen, p_note: note });
  if (error) redirect(`/admin/investors?error=${/own_registration/.test(error.message) ? "own" : "failed"}`);
  revalidatePath("/admin/investors");
  redirect(`/admin/investors?done=${seen ? "seen" : "not_found"}`);
}
