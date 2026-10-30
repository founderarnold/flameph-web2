"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/server";

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

export async function reportBusiness(fd: FormData) {
  const slug = String(fd.get("slug") ?? "").replace(/[^a-z0-9-]/gi, "").slice(0, 80);
  const businessId = String(fd.get("business_id") ?? "");
  const reason = String(fd.get("reason") ?? "");
  const details = String(fd.get("details") ?? "").trim().slice(0, 1000);
  const allowedReasons = ["spam", "fraud", "abuse", "wrong_information", "closed", "other"];
  const { user } = await requireUser(`/directory/${slug}#report`);
  if (!/^[0-9a-f-]{36}$/i.test(businessId) || !allowedReasons.includes(reason) || details.length < 10) redirect(`/directory/${slug}?report=invalid#report`);

  const admin = createAdminClient();
  if (!admin) redirect(`/directory/${slug}?report=error#report`);
  const { data: business } = await admin.from("businesses").select("id,name,slug,owner_id,published").eq("id", businessId).eq("slug", slug).maybeSingle();
  if (!business?.published || business.owner_id === user.id) redirect(`/directory/${slug}?report=invalid#report`);

  const since = new Date(Date.now() - 86400000).toISOString();
  const { count } = await admin.from("submissions").select("id", { count: "exact", head: true }).eq("type", "business-report").eq("user_id", user.id).gte("created_at", since);
  if ((count ?? 0) >= 5) redirect(`/directory/${slug}?report=limit#report`);

  const { error } = await admin.from("submissions").insert({
    type: "business-report",
    user_id: user.id,
    email: user.email ?? null,
    data: { business_id: business.id, business_name: business.name, business_slug: business.slug, reason, details },
  });
  revalidatePath("/admin/directory");
  redirect(`/directory/${slug}?report=${error ? "error" : "received"}#report`);
}
