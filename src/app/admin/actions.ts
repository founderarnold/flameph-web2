"use server";
import { log as ecosystemLog, notifySites } from "@/lib/ecosystem-sso";
import { revalidatePath, revalidateTag } from "next/cache";
import { redirect } from "next/navigation";
import { friendlyDbError } from "@/lib/db-errors";
import { adminContext } from "@/lib/admin/guard";
import { getAdminTable, PK, type AdminField } from "@/lib/admin/config";
import { getRealEstateAdminSection } from "@/lib/real-estate-admin";
import { autoReviewWaiting } from "@/lib/listing-auto-review";

const slugify = (s: string) => s.toLowerCase().normalize("NFKD").replace(/[^\w\s-]/g, "").trim().replace(/[\s_-]+/g, "-").slice(0, 60);

async function uploadFile(db: NonNullable<Awaited<ReturnType<typeof adminContext>>["db"]>, bucket: string, file: File, folder: string) {
  const path = `${folder}/${Date.now()}-${file.name.replace(/[^\w.-]/g, "_")}`;
  const { error } = await db.storage.from(bucket).upload(path, file, { contentType: file.type || undefined });
  if (error) throw new Error(`Upload failed: ${error.message}`);
  return path;
}

function parseField(f: AdminField, fd: FormData): unknown {
  const v = fd.get(f.name);
  switch (f.type) {
    case "bool": return fd.get(f.name) === "on";
    case "number": return v === null || v === "" ? null : Number(v);
    case "datetime": return v ? new Date(`${v}:00+08:00`).toISOString() : null; // inputs are Manila time
    case "date": return v || null;
    case "tags": return typeof v === "string" ? [...new Set(v.split(",").map((x) => x.trim()).filter(Boolean))] : [];
    case "links": {
      const lines = String(v || "").split("\n").map((l) => l.trim()).filter(Boolean);
      return lines.map((l) => { const [label, url] = l.split("|").map((x) => x.trim()); return { label: url ? label : label, url: url || label }; }).filter((x) => /^https?:\/\//.test(x.url));
    }
    case "benefits": {
      const lines = String(v || "").split("\n").map((l) => l.trim()).filter(Boolean);
      return lines.map((l) => { const [label, status] = l.split("|").map((x) => x.trim()); return { label, status: ["live", "beta", "soon"].includes(status) ? status : "soon" }; });
    }
    default: return typeof v === "string" ? v.trim() || null : null;
  }
}

export async function saveRow(fd: FormData) {
  const tableName = String(fd.get("__table"));
  const id = String(fd.get("__id"));
  const cfg = getAdminTable(tableName);
  if (!cfg) throw new Error("Unknown table");
  const ctx = await adminContext(cfg.roles);
  const pk = PK[tableName] ?? "id";
  const row: Record<string, unknown> = {};

  const existing = id !== "new" ? (await ctx.db.from(tableName).select("*").eq(pk, id).single()).data : null;

  for (const f of cfg.fields) {
    if (f.type === "image" || f.type === "privateFile") {
      const file = fd.get(f.name);
      if (file instanceof File && file.size > 0) row[f.name] = await uploadFile(ctx.db, f.type === "privateFile" ? "private-docs" : "media", file, `admin/${tableName}`);
      else if (fd.get(`${f.name}__remove`) === "on") row[f.name] = null;
      continue;
    }
    if (f.type === "images") {
      const keep = fd.getAll(`${f.name}__keep`).map(String);
      const files = fd.getAll(f.name).filter((x): x is File => x instanceof File && x.size > 0);
      const added = await Promise.all(files.map((file) => uploadFile(ctx.db, "media", file, `admin/${tableName}`)));
      row[f.name] = [...keep, ...added];
      continue;
    }
    row[f.name] = parseField(f, fd);
    if (f.required && (row[f.name] === null || row[f.name] === "")) redirect(`/admin/content/${tableName}/${id}?error=${encodeURIComponent(`${f.label} is required`)}`);
  }

  if (cfg.publishRule && row.published) {
    const v = row[cfg.publishRule.field] ?? existing?.[cfg.publishRule.field];
    if (!v) redirect(`/admin/content/${tableName}/${id}?error=${encodeURIComponent(cfg.publishRule.message)}`);
  }
  if (cfg.slugFrom && (!existing || !existing.slug)) row.slug = `${slugify(String(row[cfg.slugFrom] ?? "item"))}-${Math.random().toString(36).slice(2, 6)}`;
  if (tableName === "posts" && row.published && !row.published_at) row.published_at = new Date().toISOString();

  // Chapter leaders may only touch their own chapter and its events.
  if (ctx.onlyChapterLeader) {
    if (tableName === "chapters" && (id === "new" || !ctx.chapterIds.includes(id))) redirect("/admin?denied=1");
    if (tableName === "events") {
      const chapterId = existing?.chapter_id ?? ctx.chapterIds[0];
      if (!chapterId || !ctx.chapterIds.includes(chapterId)) redirect("/admin?denied=1");
      row.chapter_id = chapterId;
    }
  }

  const res = id === "new" ? await ctx.db.from(tableName).insert(row).select(pk).single() : await ctx.db.from(tableName).update(row).eq(pk, id).select(pk).single();
  if (res.error) redirect(`/admin/content/${tableName}/${id}?error=${encodeURIComponent(friendlyDbError(res.error, "this item"))}`);
  const newId = String((res.data as unknown as Record<string, unknown>)[pk]);
  await ctx.audit(id === "new" ? "create" : "update", tableName, newId, { fields: Object.keys(row) });
  revalidateTag("content"); revalidateTag("stats");
  revalidatePath("/", "layout");
  redirect(`/admin/content/${tableName}?saved=1`);
}

export async function deleteRow(fd: FormData) {
  const tableName = String(fd.get("__table"));
  const id = String(fd.get("__id"));
  const cfg = getAdminTable(tableName);
  if (!cfg) throw new Error("Unknown table");
  const ctx = await adminContext(cfg.roles.filter((r) => r !== "chapter_leader"));
  await ctx.db.from(tableName).delete().eq(PK[tableName] ?? "id", id);
  await ctx.audit("delete", tableName, id);
  revalidateTag("content"); revalidateTag("stats");
  redirect(`/admin/content/${tableName}?deleted=1`);
}

export async function setSubmissionStatus(fd: FormData) {
  const ctx = await adminContext(["super_admin", "admin"]);
  const id = String(fd.get("id")); const status = String(fd.get("status"));
  if (!["new", "contacted", "done"].includes(status)) return;
  await ctx.db.from("submissions").update({ status, notes: String(fd.get("notes") ?? "") || null }).eq("id", id);
  await ctx.audit("submission_status", "submissions", id, { status });
  revalidatePath("/admin/submissions");
}

export async function setRealEstateStatus(fd: FormData) {
  const ctx = await adminContext(["super_admin", "admin"]);
  const id = String(fd.get("id") ?? "");
  const section = String(fd.get("section") ?? "");
  const status = String(fd.get("status") ?? "");
  const config = getRealEstateAdminSection(section);
  if (!id || !config || !config.statuses.includes(status as never)) return;
  const result = await ctx.db.from(config.table).update({ status, updated_at: new Date().toISOString() }).eq("id", id);
  if (!result.error) await ctx.audit("real_estate_status", config.table, id, { status });
  revalidatePath("/admin");
  revalidatePath("/admin/real-estate");
  revalidatePath(`/admin/real-estate/${section}`);
  redirect(`/admin/real-estate/${section}?saved=1`);
}

/**
 * The listing id on Directory verification forms. The field is called "business_id", never "id": a form field named
 * "id" hides the form's own id property in the browser, and React then drops the value of the button that was
 * pressed (Approve and publish, Reject, ...), so the server saw no action and silently did nothing (fixed 25 Nov 2026).
 */
const businessIdOf = (fd: FormData) => String(fd.get("business_id") ?? fd.get("id") ?? "");

/** Where to go back to after a Directory verification button: the same filter and page the admin was on. */
function directoryBack(fd: FormData, params: Record<string, string>) {
  const raw = String(fd.get("return_to") ?? "");
  const url = new URL(raw.startsWith("/admin/directory") ? raw : "/admin/directory", "https://x.invalid");
  for (const k of ["done", "error", "name", "published", "held", "checked", "failed", "moderated", "reviewed"]) url.searchParams.delete(k);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const id = businessIdOf(fd);
  return `${url.pathname}?${url.searchParams.toString()}#${id ? `b-${id}` : "top"}`;
}

function revalidateDirectory(slug?: string | null) {
  revalidateTag("content"); revalidateTag("stats"); revalidateTag("directory");
  revalidatePath("/directory");
  if (slug) revalidatePath(`/directory/${slug}`);
  revalidatePath("/admin/directory");
}

export async function verifyBusiness(fd: FormData) {
  const ctx = await adminContext(["super_admin", "admin"]);
  const id = businessIdOf(fd); const decision = String(fd.get("decision"));
  const note = String(fd.get("note") ?? "") || null;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return;
  // "published: false" alone is put back by the database while publication_status stays "published", so set both.
  const patch = decision === "approve" ? { verified: true, verification_status: "approved", verification_note: note }
    : decision === "reject" ? { verified: false, verification_status: "rejected", verification_note: note }
    : decision === "unpublish" ? { published: false, publication_status: "unpublished" } : null;
  if (!patch) return;
  const { data: row, error } = await ctx.db.from("businesses").update(patch).eq("id", id).select("name,slug").maybeSingle();
  if (error || !row) redirect(directoryBack(fd, { error: "save-failed" }));
  await ctx.audit(`business_${decision}`, "businesses", id, { note });
  revalidateDirectory(row.slug);
  redirect(directoryBack(fd, { done: `doc_${decision}`, name: row.name }));
}

const MODERATION_PATCH: Record<string, Record<string, unknown>> = {
  hide: { published: false, publication_status: "unpublished" },
  restore: { published: true, publication_status: "published", lifecycle_status: "approved", risk_level: "low" },
  approve_legitimate: { risk_level: "low", moderation_reason_categories: [], moderation_fields: [], lifecycle_status: "approved", publication_status: "published", published: true },
  request_correction: { risk_level: "needs_review", lifecycle_status: "needs_correction", publication_status: "unpublished", published: false },
  keep_quarantined: { risk_level: "high", lifecycle_status: "needs_correction", publication_status: "unpublished", published: false },
  reject: { lifecycle_status: "rejected", publication_status: "unpublished", published: false },
  suspend: { lifecycle_status: "suspended", publication_status: "unpublished", published: false },
};

export async function moderateBusiness(fd: FormData) {
  const ctx = await adminContext(["super_admin", "admin"]);
  const id = businessIdOf(fd);
  const action = String(fd.get("moderation_action") ?? "");
  if (!/^[0-9a-f-]{36}$/i.test(id)) redirect(directoryBack(fd, { error: "not-found" }));
  const { data: business } = await ctx.db.from("businesses").select("id,owner_id,slug,name,published,risk_level,lifecycle_status,publication_status").eq("id", id).maybeSingle();
  if (!business) redirect(directoryBack(fd, { error: "not-found" }));

  if (action === "restore" || action === "approve_legitimate") {
    const { data: owner } = await ctx.db.from("profiles").select("status").eq("id", business.owner_id).maybeSingle();
    if (owner?.status !== "active") redirect(directoryBack(fd, { error: "owner-suspended", name: business.name }));
  }
  if (MODERATION_PATCH[action]) {
    // Every change is read back, so a refused write shows an error instead of looking like nothing happened.
    const { data: row, error } = await ctx.db.from("businesses").update(MODERATION_PATCH[action]).eq("id", id).select("published").maybeSingle();
    if (error || !row) {
      console.error("moderateBusiness", action, id, error?.code, error?.message);
      redirect(directoryBack(fd, { error: "save-failed", name: business.name }));
    }
    if ((action === "approve_legitimate" || action === "restore") && !row.published) redirect(directoryBack(fd, { error: "not-published", name: business.name }));
  } else if (action === "ban_owner") {
    const [p, b] = await Promise.all([
      ctx.db.from("profiles").update({ status: "suspended" }).eq("id", business.owner_id),
      // publication_status is what the listing rules read; "published" alone is put back by the database (Phase 12 fix).
      ctx.db.from("businesses").update({ published: false, publication_status: "unpublished" }).eq("owner_id", business.owner_id),
    ]);
    if (p.error || b.error) redirect(directoryBack(fd, { error: "save-failed", name: business.name }));
  } else if (action === "delete_business") {
    if (!ctx.roles.includes("super_admin") || String(fd.get("confirmation") ?? "") !== "DELETE") redirect(directoryBack(fd, { error: "delete-confirm", name: business.name }));
    const { error } = await ctx.db.from("businesses").delete().eq("id", id);
    if (error) redirect(directoryBack(fd, { error: "save-failed", name: business.name }));
  } else redirect(directoryBack(fd, { error: "unknown-action" }));

  await ctx.audit(`business_${action}`, "businesses", id, { owner_id: business.owner_id, name: business.name });
  revalidateDirectory(business.slug);
  redirect(directoryBack(fd, { done: action, name: business.name }));
}

/** "Check waiting listings now": runs the automatic directory check on every listing that is not public yet. */
export async function runDirectoryAutoCheck(fd: FormData) {
  const ctx = await adminContext(["super_admin", "admin"]);
  const results = await autoReviewWaiting(ctx.db);
  const count = (o: string) => results.filter((r) => r.outcome === o).length;
  await ctx.audit("business_auto_check_run", "businesses", undefined, { checked: results.length, published: count("publish"), held: count("hold") + count("high") });
  revalidateDirectory();
  redirect(directoryBack(fd, { done: "auto_check", checked: String(results.length), published: String(count("publish")), held: String(count("hold") + count("high")), failed: String(count("error")) }));
}

export async function reviewLegacyBusiness(fd: FormData) {
  const ctx = await adminContext(["super_admin", "admin"]);
  const id = businessIdOf(fd);
  const decision = String(fd.get("legacy_decision") ?? "");
  const note = String(fd.get("note") ?? "").trim().slice(0, 1000) || null;
  if (!/^[0-9a-f-]{36}$/i.test(id) || !["confirm_quarantine", "restore_public", "clear_review"].includes(decision)) redirect(directoryBack(fd, { error: "unknown-action" }));
  const { error } = await ctx.db.rpc("review_business_legacy_assessment", {
    p_business_id: id,
    p_decision: decision,
    p_actor_id: ctx.user.id,
    p_note: note,
  });
  revalidateDirectory();
  redirect(directoryBack(fd, error ? { error: "legacy-review" } : { done: `legacy_${decision}` }));
}

/** Founders give or remove any role. Admins give or remove only the four partner roles (Partner Step 1). Audited. */
export async function setRole(fd: FormData) {
  const ctx = await adminContext(["super_admin", "admin"]);
  const userId = String(fd.get("user_id")); const role = String(fd.get("role")); const op = String(fd.get("op"));
  const SITE = ["super_admin", "admin", "editor", "chapter_leader"];
  const PARTNER = ["chapter_coordinator", "chapter_tester", "national_reviewer", "finance"];
  const back = (r: string) => redirect(`/admin/members?role=${r}`);
  if (!/^[0-9a-f-]{36}$/i.test(userId) || !["add", "remove"].includes(op) || ![...SITE, ...PARTNER].includes(role)) return back("failed");
  if (SITE.includes(role) && !ctx.roles.includes("super_admin")) return back("denied");
  const needsChapter = ["chapter_leader", "chapter_coordinator", "chapter_tester"].includes(role);
  const chapterId = needsChapter ? (String(fd.get("chapter_id") || "") || null) : null;
  if (op === "add" && ["chapter_coordinator", "chapter_tester"].includes(role) && !chapterId) return back("chapter");
  const { error } = op === "add"
    ? await ctx.db.from("roles").upsert({ user_id: userId, role, chapter_id: chapterId })
    : await ctx.db.from("roles").delete().eq("user_id", userId).eq("role", role);
  if (error) return back("failed");
  await ctx.audit(`role_${op}`, "roles", userId, { role, chapter_id: chapterId });
  revalidatePath("/admin/members");
  return back("ok");
}

export async function setMemberStatus(fd: FormData) {
  const ctx = await adminContext(["super_admin", "admin"]);
  const id = String(fd.get("id"));
  const status = fd.get("status") === "suspended" ? "suspended" : "active";
  await ctx.db.from("profiles").update({ status }).eq("id", id);
  if (status === "suspended") await ctx.db.from("businesses").update({ published: false }).eq("owner_id", id);
  await ctx.audit("member_status", "profiles", id, { status });
  revalidateTag("content"); revalidateTag("stats"); revalidateTag("directory");
  revalidatePath("/directory");
  revalidatePath("/admin/members");
}

export async function deleteMember(fd: FormData) {
  const ctx = await adminContext(["super_admin"]);
  const id = String(fd.get("id") ?? "");
  if (!/^[0-9a-f-]{36}$/i.test(id) || String(fd.get("confirmation") ?? "") !== "DELETE" || id === ctx.user.id) return;
  const { data: targetRoles } = await ctx.db.from("roles").select("role").eq("user_id", id);
  if ((targetRoles ?? []).some((row) => row.role === "super_admin")) return;
  const { error } = await ctx.db.auth.admin.deleteUser(id);
  if (!error) await ctx.audit("member_delete", "profiles", id);
  revalidateTag("content"); revalidateTag("stats"); revalidateTag("directory");
  revalidatePath("/directory");
  redirect(`/admin/members?${error ? "error=delete" : "deleted=1"}`);
}

export async function reviewFeedback(fd: FormData) {
  const ctx = await adminContext(["super_admin", "admin"]);
  const id = String(fd.get("id"));
  await ctx.db.from("ai_feedback").update({ reviewed: true }).eq("id", id);
  await ctx.audit("ai_feedback_reviewed", "ai_feedback", id);
  revalidatePath("/admin/ai");
}

export async function saveSettings(fd: FormData) {
  const ctx = await adminContext(["super_admin", "admin"]);
  const num = (k: string, d: number) => { const v = Number(fd.get(k)); return Number.isFinite(v) && v >= 0 ? v : d; };
  const str = (k: string) => String(fd.get(k) ?? "").trim();
  const socials: Record<string, string> = {};
  for (const k of ["facebook", "messenger", "tiktok", "youtube", "instagram", "linkedin", "x"]) { const v = str(`social_${k}`); if (/^https?:\/\//.test(v)) socials[k] = v; }
  const donation = { bank: str("don_bank"), account_name: str("don_account_name"), account_no: str("don_account_no"), gcash: str("don_gcash"), receipts_note: str("don_receipts") };
  const values: Record<string, unknown> = {
    social_links: socials,
    stat_thresholds: { founding_members: num("founding_members", 50), ai_helpful_min_ratings: num("ai_helpful_min_ratings", 20) },
    ai_limits: { guest: num("ai_guest", 3), free: num("ai_free", 10), starter: num("ai_starter", 20), micro: num("ai_micro", 30), neo: num("ai_neo", 40), pro: num("ai_pro", 60), champion: num("ai_champion", 100) },
    ai_monthly_cap_usd: num("ai_cap", 0),
    ai_member_monthly_cap_usd: num("ai_member_cap", 2),
    launch_date: str("launch_date") || null,
    donation_details: donation.account_no || donation.gcash ? donation : null,
    legal_status: { terms: fd.get("legal_terms") === "on" ? "approved" : "draft", privacy: fd.get("legal_privacy") === "on" ? "approved" : "draft", membership: fd.get("legal_membership") === "on" ? "approved" : "draft" },
  };
  const rows = Object.entries(values).map(([key, value]) => ({ key, value, is_public: true, updated_at: new Date().toISOString() }));
  await ctx.db.from("settings").upsert(rows);
  await ctx.audit("settings_update", "settings", undefined, { keys: Object.keys(values) });
  revalidateTag("settings"); revalidateTag("stats");
  redirect("/admin/settings?saved=1");
}

/** Phase 10A off switches. Kept apart from the other settings: not public, and read by the database itself. */
export async function saveEcosystemSwitches(fd: FormData) {
  const ctx = await adminContext(["super_admin", "admin"]);
  const value = { badges: fd.get("badges") === "on", sso: fd.get("sso") === "on" };
  const { data: before } = await ctx.db.from("settings").select("value").eq("key", "ecosystem").maybeSingle();
  await ctx.db.from("settings").upsert({ key: "ecosystem", value, is_public: false, updated_at: new Date().toISOString() });
  await ctx.audit("ecosystem_switches", "settings", "ecosystem", { before: before?.value ?? null, after: value });
  await ecosystemLog(ctx.db, "flameph", ctx.user.id, "switch_change", [], "ok", `badges=${value.badges} sso=${value.sso}`);
  if (!value.badges && (before?.value as { badges?: boolean } | undefined)?.badges !== false) await notifySites(ctx.db, null, "switch_change");
  redirect("/admin/settings?switches=1");
}
