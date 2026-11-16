import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { CONSENT_KEYS, POLICY_VERSION, hasCurrentTerms, type ConsentKey, type ConsentSource, type ConsentState } from "@/lib/policy";

/**
 * The member's current choice for each switch (their newest row). `ready` is false when the consent log
 * is not in the database yet (migration 0015 not applied): callers then never block or prompt anyone.
 */
export async function getConsents(supabase: SupabaseClient, userId: string): Promise<{ ready: boolean; state: ConsentState }> {
  const { data, error } = await supabase
    .from("member_consent_current")
    .select("consent_key, granted, policy_version, created_at")
    .eq("user_id", userId)
    .limit(CONSENT_KEYS.length);
  if (error) return { ready: false, state: {} };
  const state: ConsentState = {};
  for (const r of data ?? []) {
    if ((CONSENT_KEYS as string[]).includes(r.consent_key)) state[r.consent_key as ConsentKey] = { granted: r.granted, version: r.policy_version, at: r.created_at };
  }
  return { ready: true, state };
}

/** True when the member should see the "new policies" prompt. Never true if the log isn't available. */
export async function needsConsentPrompt(supabase: SupabaseClient, userId: string) {
  const { ready, state } = await getConsents(supabase, userId);
  return ready && !hasCurrentTerms(state);
}

/**
 * Appends one row per switch whose choice changed (or that has no row yet for the current version).
 * Rows are never edited; the database stamps the time.
 */
export async function recordConsents(supabase: SupabaseClient, userId: string, choices: Record<ConsentKey, boolean>, source: ConsentSource, current: ConsentState) {
  const rows = CONSENT_KEYS
    .filter((k) => current[k]?.granted !== choices[k] || (k === "terms" && choices.terms && current.terms?.version !== POLICY_VERSION))
    .map((k) => ({ user_id: userId, consent_key: k, granted: choices[k], policy_version: POLICY_VERSION, source }));
  if (!rows.length) return { ok: true, changed: [] as ConsentKey[] };
  const { error } = await supabase.from("member_consents").insert(rows);
  return { ok: !error, changed: rows.map((r) => r.consent_key) };
}
