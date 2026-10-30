import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/server";
import { verifyTurnstile } from "@/lib/turnstile";
import { checkRateLimit, retryAfterHeaders } from "@/lib/rate-limit";
import { moderateBusinessContent } from "@/lib/business-moderation";

const BUSINESS_MODERATION_SELECT = "id,owner_id,name,sector,description,products,city,province,contact_email,contact_phone,contact_viber,contact_messenger,website_url,facebook_url,photos,logo_url";

export async function POST(req: Request) {
  const { supabase, user } = await getSession();
  if (!supabase || !user) return NextResponse.json({ error: "Please log in again." }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const businessId = typeof body.businessId === "string" ? body.businessId : "";
  if (!/^[0-9a-f-]{36}$/i.test(businessId)) return NextResponse.json({ error: "Business not found." }, { status: 400 });

  // Persist a just-completed email/OAuth proof before checking completeness.
  await supabase.rpc("sync_my_account_verification");
  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ error: "Business review is not connected right now." }, { status: 503 });
  const requirements = await admin.rpc("business_submission_missing_requirements", { p_business_id: businessId, p_owner_id: user.id });
  if (requirements.error) return NextResponse.json({ error: "Could not check business completeness. Please try again." }, { status: 503 });
  const missing = Array.isArray(requirements.data) ? requirements.data.filter((item): item is string => typeof item === "string") : [];
  if (missing.includes("business_not_found")) return NextResponse.json({ error: "Business not found." }, { status: 404 });
  if (missing.length) {
    return NextResponse.json({ error: "Complete every required listing item before submitting.", missing }, { status: 422 });
  }

  const botCheck = await verifyTurnstile(req, body.turnstileToken, "business_submit");
  if (!botCheck.ok) return NextResponse.json({ error: botCheck.error }, { status: botCheck.status });
  const limit = await checkRateLimit(req, "business_submit", { identifier: user.id, increment: false });
  if (!limit) return NextResponse.json({ error: "Business submission is temporarily unavailable." }, { status: 503 });
  if (!limit.allowed) {
    return NextResponse.json({ error: "You've reached today's submission limit. Please try again tomorrow." }, { status: 429, headers: retryAfterHeaders(limit.retryAfter) });
  }

  const tenMinutesAgo = new Date(Date.now() - 10 * 60_000).toISOString();
  const [{ data: business, error: businessError }, { data: otherBusinesses, error: othersError }, { count: recentSubmissions, error: recentError }] = await Promise.all([
    admin.from("businesses").select(BUSINESS_MODERATION_SELECT).eq("id", businessId).eq("owner_id", user.id).maybeSingle(),
    admin.from("businesses").select(BUSINESS_MODERATION_SELECT).neq("id", businessId).limit(2000),
    admin.from("business_moderation_events").select("id", { count: "exact", head: true }).eq("owner_id", user.id).gte("created_at", tenMinutesAgo),
  ]);
  if (businessError || othersError || recentError || !business) {
    return NextResponse.json({ error: business ? "Could not validate your business right now. Please try again." : "Business not found." }, { status: business ? 503 : 404 });
  }

  const assessment = moderateBusinessContent(business, {
    others: otherBusinesses ?? [],
    recentSubmissions: recentSubmissions ?? 0,
  });
  const { error: moderationError } = await admin.rpc("record_business_moderation", {
    p_business_id: businessId,
    p_owner_id: user.id,
    p_risk_level: assessment.riskLevel,
    p_reason_categories: assessment.reasonCategories,
    p_suspicious_fields: assessment.suspiciousFields,
    p_assessment_version: "content-v1",
    p_snapshot: business,
  });
  if (moderationError) {
    return NextResponse.json({ error: "Could not validate your business right now. Please try again." }, { status: 503 });
  }
  if (assessment.riskLevel === "high") {
    return NextResponse.json({
      code: "BUSINESS_INFORMATION_NEEDS_CORRECTION",
      title: "Business Information Needs Correction",
      error: "We couldn't submit this listing yet. Please correct the highlighted business information and try again.",
      message: "Please enter your real business name and clear, genuine information about what you offer.",
      fields: assessment.suspiciousFields,
    }, { status: 422 });
  }

  const consumedLimit = await checkRateLimit(req, "business_submit", { identifier: user.id });
  if (!consumedLimit) return NextResponse.json({ error: "Business submission is temporarily unavailable." }, { status: 503 });
  if (!consumedLimit.allowed) {
    return NextResponse.json({ error: "You've reached today's submission limit. Please try again tomorrow." }, { status: 429, headers: retryAfterHeaders(consumedLimit.retryAfter) });
  }

  const { error } = await admin.rpc("submit_business_for_review", { p_business_id: businessId, p_owner_id: user.id });
  if (error) {
    const message = /EMAIL_NOT_VERIFIED/i.test(error.message) ? "Verify your email before submitting."
      : /MOBILE_NOT_VERIFIED/i.test(error.message) ? "Mobile verification is required before submitting."
      : /BUSINESS_NOT_SUBMITTABLE/i.test(error.message) ? "This business is already submitted or cannot be submitted in its current state."
      : /BUSINESS_INCOMPLETE/i.test(error.message) ? "Complete every required listing item before submitting."
      : /BUSINESS_HIGH_SUSPICION/i.test(error.message) ? "Please correct the business information before submitting again."
      : /BUSINESS_NOT_FOUND/i.test(error.message) ? "Business not found."
      : "Could not submit your business. Please try again.";
    return NextResponse.json({ error: message }, { status: /NOT_FOUND/i.test(error.message) ? 404 : 400 });
  }
  return NextResponse.json({ ok: true, riskLevel: assessment.riskLevel });
}
