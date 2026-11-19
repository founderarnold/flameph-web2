import "server-only";
import { redirect } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireUser } from "@/lib/auth";
import type { ModLevel } from "@/lib/moderation";

export type Report = {
  id: string; reporter_id: string | null; target_type: string; target_id: string; target_owner_id: string | null;
  chapter_id: string | null; group_id: string | null; reason: string; details: string | null; status: string;
  created_at: string; due_at: string; escalated_at: string | null; escalation_reason: string | null; resolved_at: string | null; resolution: string | null;
};
export type Preview = { report_id: string; owner_name: string; preview: string | null; link: string | null };
export type LogEntry = {
  id: number; report_id: string | null; actor_id: string | null; actor_role: string; action: string; target_type: string | null;
  target_id: string | null; target_owner_id: string | null; note: string | null; until: string | null; ref_action_id: number | null; created_at: string;
};
export const REPORT_COLUMNS = "id, reporter_id, target_type, target_id, target_owner_id, chapter_id, group_id, reason, details, status, created_at, due_at, escalated_at, escalation_reason, resolved_at, resolution";

/** Signed-in moderator (chapter head, admin or founder), or back to the account page. available is false before 0019. */
export async function requireModerator(next: string, min: ModLevel = 1) {
  const s = await requireUser(next);
  const { data, error } = await s.supabase.rpc("mod_level");
  const level = (error ? (s.roles.includes("super_admin") ? 3 : s.roles.includes("admin") ? 2 : s.roles.includes("chapter_leader") ? 1 : 0) : Number(data) || 0) as ModLevel;
  if (level < min) redirect("/account?denied=1");
  const { data: rows } = await s.supabase.from("roles").select("chapter_id").eq("user_id", s.user.id).eq("role", "chapter_leader");
  const myChapters = (rows ?? []).map((r) => r.chapter_id).filter(Boolean) as string[];
  return { ...s, level, available: !error, myChapters };
}

export async function previews(supabase: SupabaseClient, ids: string[]): Promise<Map<string, Preview>> {
  if (!ids.length) return new Map();
  const { data } = await supabase.rpc("report_previews", { ids: ids.slice(0, 100) });
  return new Map(((data ?? []) as Preview[]).map((p) => [p.report_id, p]));
}

/** Reports about an investor/funder post or a reply under one (0026), so the queue shows the warning with the text. */
export async function investorReports(supabase: SupabaseClient, ids: string[]): Promise<Set<string>> {
  if (!ids.length) return new Set();
  const { data, error } = await supabase.rpc("report_investor_ids", { ids: ids.slice(0, 100) });
  if (error) return new Set();
  return new Set(((data ?? []) as (string | { report_investor_ids: string })[]).map((x) => (typeof x === "string" ? x : x.report_investor_ids)));
}

/** "Held automatically: promises_returns" in plain words for moderators. */
export function heldDetails(details: string | null): string | null {
  if (!details) return details;
  return details
    .replace("promises_returns", "promises fixed, guaranteed or risk-free returns")
    .replace("recruitment_scheme", "pyramid, MLM or recruitment structure");
}

/** Display names for the people in the log (moderators and members), at most 100. */
export async function peopleNames(supabase: SupabaseClient, ids: (string | null)[]): Promise<Map<string, string>> {
  const unique = [...new Set(ids.filter((x): x is string => Boolean(x)))].slice(0, 100);
  if (!unique.length) return new Map();
  const { data } = await supabase.from("profiles").select("id, full_name").in("id", unique);
  return new Map((data ?? []).map((p) => [p.id as string, (p.full_name as string) || "Member"]));
}
