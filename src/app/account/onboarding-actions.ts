"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { isIndustry, subsOf } from "@/lib/industries";
import { PROVINCES } from "@/content/ph-provinces";
import { regionOf } from "@/content/ph-regions";
import { visibilityFromForm, type RegistrationVisibility } from "@/lib/privacy";
import { feedResult } from "@/lib/member-shell";
import { safeNext } from "@/lib/safe-next";
import { STEPS, type Step } from "@/lib/onboarding";
import { chapterGroupSlug, isGroupSlug } from "@/lib/groups";

const s = (v: FormDataEntryValue | null, max = 120) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const uuid = (v: string) => (/^[0-9a-f-]{36}$/i.test(v) ? v : null);
const STAGES = ["discover", "start", "build", "grow", "scale"];

/** After a step: the next step, or the feed when the last step is done. "Not now" skips a step without saving. */
function after(step: Step, error?: string): never {
  if (error) redirect(`/welcome?step=${step}&error=${error}`);
  const i = STEPS.indexOf(step);
  redirect(i < STEPS.length - 1 ? `/welcome?step=${STEPS[i + 1]}` : feedResult("onboarded"));
}

/** Step 1: industries the member cares about (up to 10, from the taxonomy). */
export async function saveIndustries(fd: FormData) {
  const { supabase, user } = await requireUser("/welcome");
  const picked = [...new Set(fd.getAll("industry").map(String).filter(isIndustry))].slice(0, 10);
  const { error } = await supabase.from("profiles").update({ industries: picked }).eq("id", user.id);
  revalidatePath("/home");
  after("industries", error ? "save" : undefined);
}

/** Step 2, when the profile has no place yet: province and city first, so we can suggest the member's local chapter. */
export async function saveLocation(fd: FormData) {
  const { supabase, user } = await requireUser("/welcome");
  const province = s(fd.get("province"));
  if (!PROVINCES.includes(province)) redirect("/welcome?step=chapter&where=1&error=province");
  const { error } = await supabase.from("profiles").update({ province, city: s(fd.get("city")) || null }).eq("id", user.id);
  revalidatePath("/home");
  redirect(error ? "/welcome?step=chapter&where=1&error=save" : "/welcome?step=chapter");
}

/**
 * Step 2: the member's local chapter (or none), and the industry chapters (groups) they want to be in.
 * Joining the local chapter also joins its group, so its posts reach them. Industry groups that were shown and left
 * unticked are left; groups that were not on the screen are never touched.
 */
export async function saveChapter(fd: FormData) {
  const { supabase, user } = await requireUser("/welcome");
  const chapter = uuid(s(fd.get("chapter_id"), 40));
  const { error } = await supabase.from("profiles").update({ chapter_id: chapter }).eq("id", user.id);
  if (!error && chapter) {
    const { data: c } = await supabase.from("chapters").select("id, slug").eq("id", chapter).maybeSingle();
    if (c) await supabase.rpc("join_group", { p_slug: chapterGroupSlug(c) });
  }
  const shown = new Set(fd.getAll("shown_group").map(String).filter(isGroupSlug).slice(0, 40));
  const picked = new Set(fd.getAll("industry_group").map(String).filter((g) => shown.has(g)));
  await Promise.all([...picked].map((slug) => supabase.rpc("join_group", { p_slug: slug })));
  const drop = [...shown].filter((g) => !picked.has(g));
  if (drop.length) {
    const { data: gs } = await supabase.from("community_groups").select("id").eq("kind", "industry").in("slug", drop);
    const ids = (gs ?? []).map((g) => g.id as string);
    if (ids.length) await supabase.from("group_members").delete().eq("user_id", user.id).in("group_id", ids);
  }
  revalidatePath("/home");
  revalidatePath("/groups", "layout");
  after("chapter", error ? "save" : undefined);
}

/** Follow or unfollow a member. Returns to the page it came from (onboarding, the feed or a profile). */
export async function toggleFollow(fd: FormData) {
  const { supabase, user } = await requireUser("/home");
  const target = uuid(s(fd.get("member_id"), 40));
  const back = safeNext(s(fd.get("back"), 300), "/home");
  if (target && target !== user.id) {
    if (fd.get("unfollow") === "1") await supabase.from("member_follows").delete().eq("follower_id", user.id).eq("followee_id", target);
    else await supabase.from("member_follows").upsert({ follower_id: user.id, followee_id: target }, { onConflict: "follower_id,followee_id", ignoreDuplicates: true });
  }
  revalidatePath("/home");
  revalidatePath("/members", "layout");
  redirect(back);
}

/** Step 4 (last): name, place and stage, then onboarding is done and the member goes to the feed. */
export async function saveOnboardingProfile(fd: FormData) {
  const { supabase, user } = await requireUser("/welcome");
  const province = s(fd.get("province"));
  const stage = s(fd.get("business_stage"));
  const { error } = await supabase.from("profiles").update({
    full_name: s(fd.get("full_name")) || null,
    province: PROVINCES.includes(province) ? province : null,
    city: s(fd.get("city")) || null,
    business_stage: STAGES.includes(stage) ? stage : null,
  }).eq("id", user.id);
  if (error) after("profile", "save");
  await supabase.from("profiles").update({ onboarded_at: new Date().toISOString() }).eq("id", user.id).is("onboarded_at", null);
  revalidatePath("/home");
  revalidatePath("/account", "layout");
  after("profile");
}

/** "Skip for now" on any step: marks onboarding as seen so it is not shown again, and goes to the feed. */
export async function skipOnboarding() {
  const { supabase, user } = await requireUser("/welcome");
  await supabase.from("profiles").update({ onboarded_at: new Date().toISOString() }).eq("id", user.id).is("onboarded_at", null);
  revalidatePath("/home");
  redirect("/home");
}

/** Business details that the listing editor does not cover: specific industry, chapter and registration numbers. Region follows the province. */
export async function saveBusinessDetails(fd: FormData) {
  const { supabase, user } = await requireUser("/account/business");
  const { data: biz } = await supabase.from("businesses").select("id, sector, province").eq("owner_id", user.id).limit(1).maybeSingle();
  if (!biz) redirect("/account/business?details=nobusiness#details");
  const sub = s(fd.get("subsector"), 80);
  const { error } = await supabase.from("businesses").update({
    subsector: subsOf(biz.sector).includes(sub) ? sub : null,
    chapter_id: uuid(s(fd.get("chapter_id"), 40)),
    region: regionOf(biz.province),
  }).eq("id", biz.id);
  const vis = s(fd.get("reg_visibility"), 10) as RegistrationVisibility;
  const reg = {
    business_id: biz.id, owner_id: user.id,
    dti_bn: s(fd.get("dti_bn"), 40) || null, sec_reg: s(fd.get("sec_reg"), 40) || null, cda_reg: s(fd.get("cda_reg"), 40) || null,
    bmbe_cert: s(fd.get("bmbe_cert"), 40) || null, mayors_permit: s(fd.get("mayors_permit"), 40) || null, bir_tin: s(fd.get("bir_tin"), 20) || null,
    visibility: ["public", "members", "private"].includes(vis) ? vis : "private",
  };
  const { error: regError } = await supabase.from("business_registrations").upsert(reg, { onConflict: "business_id" });
  revalidatePath("/account/business");
  revalidatePath("/home");
  redirect(`/account/business?details=${error || regError ? "error" : "saved"}#details`);
}

/** Privacy controls in Settings: which business details only signed-in members can see. */
export async function savePrivacy(fd: FormData) {
  const { supabase, user } = await requireUser("/account/settings");
  const { error } = await supabase.from("businesses").update({ field_visibility: visibilityFromForm((n) => fd.get(n)) }).eq("owner_id", user.id);
  revalidatePath("/account/settings");
  revalidatePath("/members", "layout");
  redirect(`/account/settings?privacy=${error ? "error" : "saved"}#privacy`);
}
