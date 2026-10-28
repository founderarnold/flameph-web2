"use server";
import { revalidatePath, revalidateTag } from "next/cache";
import { redirect } from "next/navigation";
import { adminContext } from "@/lib/admin/guard";
import { getAdminTable, PK, type AdminField } from "@/lib/admin/config";
import { getRealEstateAdminSection } from "@/lib/real-estate-admin";

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
  if (res.error) redirect(`/admin/content/${tableName}/${id}?error=${encodeURIComponent(res.error.message)}`);
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

export async function verifyBusiness(fd: FormData) {
  const ctx = await adminContext(["super_admin", "admin"]);
  const id = String(fd.get("id")); const decision = String(fd.get("decision"));
  const note = String(fd.get("note") ?? "") || null;
  const patch = decision === "approve" ? { verified: true, verification_status: "approved", verification_note: note }
    : decision === "reject" ? { verified: false, verification_status: "rejected", verification_note: note }
    : decision === "unpublish" ? { published: false } : null;
  if (!patch) return;
  await ctx.db.from("businesses").update(patch).eq("id", id);
  await ctx.audit(`business_${decision}`, "businesses", id, { note });
  revalidateTag("content"); revalidateTag("stats");
  revalidatePath("/admin/directory");
}

export async function setRole(fd: FormData) {
  const ctx = await adminContext(["super_admin"]);
  const userId = String(fd.get("user_id")); const role = String(fd.get("role")); const op = String(fd.get("op"));
  if (!["super_admin", "admin", "editor", "chapter_leader"].includes(role)) return;
  if (op === "add") await ctx.db.from("roles").upsert({ user_id: userId, role, chapter_id: role === "chapter_leader" ? (String(fd.get("chapter_id") || "") || null) : null });
  else await ctx.db.from("roles").delete().eq("user_id", userId).eq("role", role);
  await ctx.audit(`role_${op}`, "roles", userId, { role });
  revalidatePath("/admin/members");
}

export async function setMemberStatus(fd: FormData) {
  const ctx = await adminContext(["super_admin", "admin"]);
  const id = String(fd.get("id"));
  const status = fd.get("status") === "suspended" ? "suspended" : "active";
  await ctx.db.from("profiles").update({ status }).eq("id", id);
  await ctx.audit("member_status", "profiles", id, { status });
  revalidatePath("/admin/members");
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
