"use server";
import { revalidatePath, revalidateTag } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { sendEmail, NOTIFY_TO } from "@/lib/email";
import { feedResult } from "@/lib/member-shell";
import { courseKey } from "@/lib/academy";

const STAGES = ["discover", "start", "build", "grow", "scale"];
const s = (v: FormDataEntryValue | null, max = 120) => (typeof v === "string" ? v.trim().slice(0, max) : "");

export async function saveProfile(fd: FormData) {
  const { supabase, user } = await requireUser();
  const stage = s(fd.get("business_stage"));
  // Consents are no longer saved here: they are separate switches in Settings (member_consents), kept in step with the profile flags.
  await supabase.from("profiles").update({
    full_name: s(fd.get("full_name")) || null,
    mobile: s(fd.get("mobile"), 20) || null,
    province: s(fd.get("province")) || null,
    city: s(fd.get("city")) || null,
    business_stage: STAGES.includes(stage) ? stage : null,
  }).eq("id", user.id);
  revalidateTag("stats");
  revalidatePath("/account");
  redirect(feedResult("profile"));
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

/** Mark a published Academy course as done (or not done). Saved with the member's growth-path milestones. */
export async function toggleCourse(fd: FormData) {
  const { supabase, user } = await requireUser("/academy");
  const id = s(fd.get("course_id"), 40);
  const key = courseKey(id);
  if (key) {
    const { data: course } = await supabase.from("courses").select("id").eq("id", id).eq("published", true).maybeSingle();
    if (course && fd.get("done") === "1") await supabase.from("member_milestones").upsert({ user_id: user.id, key }, { onConflict: "user_id,key" });
    else if (fd.get("done") !== "1") await supabase.from("member_milestones").delete().eq("user_id", user.id).eq("key", key);
  }
  revalidatePath("/m/academy");
  revalidatePath("/account/growth");
  revalidatePath("/account/rewards");
  redirect(`/academy${key ? `#course-${id}` : ""}`);
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
  revalidatePath("/home");
  // Back to the feed, scrolled to the group order. If it did not go through, stay on Buy Together with the error.
  // Group Order pages send their own address back, so a refused join (deadline passed, already sent) stays there.
  const back = s(fd.get("back"), 80);
  if (error) redirect(/^\/group-order(\/[0-9a-f-]{36})?$/.test(back) ? `${back}?error=join#deal-${deal}` : `/deals?error=1#deal-${deal}`);
  redirect(feedResult(fd.get("leave") === "1" ? "group-order-left" : "group-order-joined", `deal-${deal}`));
}

/** Spend points on a reward FLAME PH posted. The database checks the balance and stock. */
export async function redeemReward(fd: FormData) {
  const { supabase, user } = await requireUser("/account/rewards");
  const item = s(fd.get("item_id"), 40);
  const { data: result } = await supabase.rpc("redeem_reward", { item });
  if (result === "ok") {
    const { data: it } = await supabase.from("reward_items").select("title, points_cost").eq("id", item).single();
    await sendEmail({ to: NOTIFY_TO, subject: `Reward claimed: ${it?.title ?? item}`, text: `${user.email} claimed "${it?.title}" for ${it?.points_cost} points.\n\nFulfil it in Admin → Reward claims.` });
  }
  revalidatePath("/account/rewards");
  redirect(`/account/rewards?redeem=${typeof result === "string" ? result : "error"}#catalog`);
}
