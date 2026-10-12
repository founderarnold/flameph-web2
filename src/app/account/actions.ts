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
