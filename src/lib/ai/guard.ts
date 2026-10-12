import "server-only";
import { cookies } from "next/headers";
import { randomUUID } from "crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getSettings } from "@/lib/settings";

export async function getAnonId(): Promise<string> {
  const c = await cookies();
  let id = c.get("kf_anon")?.value;
  if (!id || !/^[\w-]{20,40}$/.test(id)) {
    id = randomUUID();
    c.set("kf_anon", id, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", maxAge: 60 * 60 * 24 * 365, path: "/" });
  }
  return id;
}

function startOfManilaDay() {
  const now = new Date();
  const manila = new Date(now.getTime() + 8 * 3600_000);
  manila.setUTCHours(0, 0, 0, 0);
  return new Date(manila.getTime() - 8 * 3600_000).toISOString();
}
function startOfManilaMonth() {
  const now = new Date(Date.now() + 8 * 3600_000);
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1) - 8 * 3600_000).toISOString();
}

export type Gate = { ok: true; limit: number; used: number } | { ok: false; reason: "limit" | "resting"; limit?: number };

/** Daily per-user/IP limits and the monthly spend cap. */
export async function checkGate(admin: SupabaseClient, who: { userId: string | null; anonId: string; ipHash: string }): Promise<Gate> {
  const settings = await getSettings();
  const limits = settings.ai_limits ?? { guest: 3, free: 10 };
  let tier = "guest";
  if (who.userId) {
    const { data } = await admin.from("profiles").select("tier").eq("id", who.userId).single();
    tier = data?.tier ?? "free";
  }
  const limit = limits[tier] ?? limits.free ?? 10;

  const cap = Number(settings.ai_monthly_cap_usd ?? 0);
  if (cap > 0) {
    const { data } = await admin.from("ai_messages").select("cost_usd").gte("created_at", startOfManilaMonth());
    const spent = (data ?? []).reduce((s, r) => s + Number(r.cost_usd ?? 0), 0);
    if (spent >= cap) return { ok: false, reason: "resting" };
  }

  const since = startOfManilaDay();
  const count = async (col: string, val: string) =>
    (await admin.from("ai_messages").select("id", { count: "exact", head: true }).eq(col, val).gte("created_at", since)).count ?? 0;
  // Members are limited by account; guests by browser id and by IP (whichever is higher). IP also caps members loosely.
  const used = who.userId ? await count("user_id", who.userId) : Math.max(await count("anon_id", who.anonId), await count("ip_hash", who.ipHash));
  const ipUsed = who.userId ? await count("ip_hash", who.ipHash) : 0;
  if (used >= limit || ipUsed >= Math.max(limit * 5, 50)) return { ok: false, reason: "limit", limit };
  return { ok: true, limit, used };
}

/** Find up to 3 published resources relevant to the question (simple keyword match). */
export async function findResources(admin: SupabaseClient, question: string) {
  const words = [...new Set(question.toLowerCase().match(/[a-zñ]{4,}/g) ?? [])].filter((w) => !STOP.has(w)).slice(0, 6);
  if (!words.length) return [];
  const or = words.flatMap((w) => [`title.ilike.%${w}%`, `summary.ilike.%${w}%`, `topic.ilike.%${w}%`]).join(",");
  const { data } = await admin.from("resources").select("id,title,slug,summary,body,last_reviewed").eq("published", true).or(or).limit(10);
  const scored = (data ?? []).map((r) => ({ r, score: words.filter((w) => `${r.title} ${r.summary}`.toLowerCase().includes(w)).length })).sort((a, b) => b.score - a.score);
  return scored.slice(0, 3).map((s) => s.r);
}

const STOP = new Set(["paano", "kung", "ano", "para", "with", "what", "that", "this", "have", "ako", "akong", "mga", "yung", "naman", "lang", "how", "the", "does", "need", "kailangan", "gusto", "sana", "pwede", "puwede", "business", "negosyo", "please", "salamat"]);
