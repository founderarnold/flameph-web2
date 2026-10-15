"use server";
import { revalidatePath, revalidateTag } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";

const STAGES = ["discover", "start", "build", "grow", "scale"];
const s = (v: FormDataEntryValue | null, max = 120) => (typeof v === "string" ? v.trim().slice(0, max) : "");

export async function saveProfile(fd: FormData) {
  const { supabase, user } = await requireUser();
  const stage = s(fd.get("business_stage"));
  const consent = fd.get("consent_privacy") === "yes";
  if (!consent) redirect("/account/profile?error=consent");
  const { data: current } = await supabase.from("profiles").select("consent_privacy").eq("id", user.id).single();
  await supabase.from("profiles").update({
    full_name: s(fd.get("full_name")) || null,
    mobile: s(fd.get("mobile"), 20) || null,
    province: s(fd.get("province")) || null,
    city: s(fd.get("city")) || null,
    business_stage: STAGES.includes(stage) ? stage : null,
    consent_privacy: true,
    consent_marketing: fd.get("consent_marketing") === "yes",
    ...(current?.consent_privacy ? {} : { consent_at: new Date().toISOString() }),
  }).eq("id", user.id);
  revalidateTag("stats");
  revalidatePath("/account");
  redirect("/account?saved=1");
}

export async function deleteAiConversation(fd: FormData) {
  const { supabase, user } = await requireUser();
  const id = s(fd.get("id"), 40);
  if (id === "all") await supabase.from("ai_conversations").delete().eq("user_id", user.id);
  else await supabase.from("ai_conversations").delete().eq("id", id).eq("user_id", user.id);
  revalidatePath("/account/ai");
}

/** One-tap answer to "Where is your business now?" from the dashboard or the welcome page. */
export async function setStage(fd: FormData) {
  const { supabase, user } = await requireUser();
  const stage = s(fd.get("stage"));
  if (STAGES.includes(stage)) await supabase.from("profiles").update({ business_stage: stage }).eq("id", user.id);
  revalidatePath("/account");
  const back = s(fd.get("back"), 200);
  redirect(back.startsWith("/account") ? back : "/account");
}

const INQUIRY_STATUSES = ["new", "read", "replied", "archived"];

export async function setInquiryStatus(fd: FormData) {
  const { supabase, user } = await requireUser("/account/inquiries");
  const status = s(fd.get("status"));
  if (INQUIRY_STATUSES.includes(status)) await supabase.from("business_inquiries").update({ status }).eq("id", s(fd.get("id"), 40)).eq("owner_id", user.id);
  revalidatePath("/account", "layout");
}

/** Self-reported growth milestones on the Growth path page. */
export async function toggleMilestone(fd: FormData) {
  const { supabase, user } = await requireUser("/account/growth");
  const key = s(fd.get("key"), 60);
  if (!/^[a-z_]+$/.test(key)) return;
  if (fd.get("done") === "1") await supabase.from("member_milestones").upsert({ user_id: user.id, key }, { onConflict: "user_id,key" });
  else await supabase.from("member_milestones").delete().eq("user_id", user.id).eq("key", key);
  revalidatePath("/account/growth");
  revalidatePath("/account");
}

/** Join or leave a buy-together deal. */
export async function joinDeal(fd: FormData) {
  const { supabase, user } = await requireUser("/deals");
  const deal = s(fd.get("deal_id"), 40);
  const qty = Math.max(1, Math.min(10000, Math.floor(Number(fd.get("quantity")) || 1)));
  const { error } = fd.get("leave") === "1"
    ? await supabase.from("deal_participants").delete().eq("deal_id", deal).eq("user_id", user.id)
    : await supabase.from("deal_participants").upsert({ deal_id: deal, user_id: user.id, quantity: qty }, { onConflict: "deal_id,user_id" });
  revalidatePath("/deals");
  revalidatePath("/account");
  redirect(`/deals?${error ? "error=1" : fd.get("leave") === "1" ? "left=1" : "joined=1"}#deal-${deal}`);
}
