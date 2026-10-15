"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";

export async function saveReview(fd: FormData) {
  const slug = String(fd.get("slug") ?? "").slice(0, 80);
  const { supabase, user } = await requireUser(`/directory/${slug}#reviews`);
  const rating = Number(fd.get("rating"));
  const body = String(fd.get("body") ?? "").trim().slice(0, 800);
  const bizId = String(fd.get("business_id") ?? "");
  if (!(rating >= 1 && rating <= 5)) redirect(`/directory/${slug}?review=rating#reviews`);
  const { data: p } = await supabase.from("profiles").select("full_name, city").eq("id", user.id).single();
  const first = (p?.full_name ?? "").trim().split(/\s+/)[0] || "Member";
  const { error } = await supabase.from("business_reviews").upsert(
    { business_id: bizId, user_id: user.id, rating, body: body || null, reviewer_name: first, reviewer_city: p?.city ?? null },
    { onConflict: "business_id,user_id" },
  );
  revalidatePath(`/directory/${slug}`);
  redirect(`/directory/${slug}?review=${error ? (/own business/i.test(error.message) ? "own" : "error") : "saved"}#reviews`);
}

export async function deleteReview(fd: FormData) {
  const slug = String(fd.get("slug") ?? "").slice(0, 80);
  const { supabase, user } = await requireUser(`/directory/${slug}`);
  await supabase.from("business_reviews").delete().eq("business_id", String(fd.get("business_id") ?? "")).eq("user_id", user.id);
  revalidatePath(`/directory/${slug}`);
  redirect(`/directory/${slug}#reviews`);
}
