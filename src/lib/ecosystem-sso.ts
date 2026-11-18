import "server-only";
import { createHash, randomBytes } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { CLIENTS, isV2, signHubMessage, verifySiteMessage } from "@/lib/sso";

/**
 * Phase 10A: the safer shared sign-in and the cross-site badge, hub side. Everything here runs on the flameph.org
 * server with the service-role client; the tables it uses (0025) are closed to browsers.
 *
 *   Sign in to a site:  site sets a browser cookie (state + nonce) -> /sso/authorize?…&state&nonce -> one-time ticket in
 *                       the address -> the site swaps it server-to-server at /api/sso/token and checks the nonce.
 *   Sign in to the hub: site asks /api/sso/establish-ticket server-to-server -> /sso/establish (hub cookie) -> the site
 *                       confirms the browser is the one that started -> /sso/establish/finish.
 *   Every hand-over is written to ecosystem_access_log.
 */

export const V2_CLIENTS = Object.keys(CLIENTS).filter(isV2);
export const TICKET_SECONDS = 60;
/** Hub cookie for step 1 of signing in here from a site. Host-only (no Domain), so no subdomain can read or set it. */
export const EST_COOKIE = "__Host-flame_est";
/** Badges another site may keep before asking again. The promise to members is "within 15 minutes". */
export const BADGE_CACHE_SECONDS = 600;
/** How often another site re-checks that a member is still signed in. */
export const SESSION_CHECK_SECONDS = 300;

export const newCode = () => randomBytes(32).toString("base64url");
export const sha256 = (v: string) => createHash("sha256").update(v).digest("hex");
export const validNonce = (v: string | null | undefined): v is string => typeof v === "string" && /^[A-Za-z0-9_-]{16,128}$/.test(v);
export const validSub = (v: unknown): v is string => typeof v === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);

export async function switchOn(admin: SupabaseClient, name: "badges" | "sso"): Promise<boolean> {
  const { data, error } = await admin.from("settings").select("value").eq("key", "ecosystem").maybeSingle();
  if (error || !data) return name === "sso"; // before 0025: sign-in as today, badges off
  const v = (data.value as Record<string, unknown> | null)?.[name];
  return typeof v === "boolean" ? v : name === "sso";
}

export async function log(admin: SupabaseClient, client: string, userId: string | null, purpose: string, fields: string[], result: string, reason?: string) {
  const { error } = await admin.rpc("ecosystem_log", { p_client: client, p_user: userId, p_purpose: purpose, p_fields: fields, p_result: result, p_reason: reason ?? null });
  if (error) console.error("ecosystem log failed", purpose, error.code ?? "");
}

/**
 * A signed server-to-server call from a site: right key, right purpose, at most 5 minutes old, and never seen before
 * (its `jti` is stored, so a copied call can't be sent again).
 */
export async function verifySiteCall(admin: SupabaseClient, client: string, purpose: string, token: string): Promise<Record<string, unknown> | null> {
  if (!isV2(client)) return null;
  const c = verifySiteMessage(client, purpose, token);
  if (!c || typeof c.jti !== "string" || !/^[A-Za-z0-9_-]{16,64}$/.test(c.jti) || (c.exp as number) - (c.iat as number) > 300) return null;
  const { error } = await admin.from("ecosystem_request_nonces").insert({ client, jti: c.jti });
  return error ? null : c;
}

/** Reads a site call from a POST body `{ client, token }`. */
export async function readSiteCall(admin: SupabaseClient, req: Request, purpose: string) {
  const body = (await req.json().catch(() => null)) as { client?: unknown; token?: unknown } | null;
  const client = typeof body?.client === "string" ? body.client : "";
  const token = typeof body?.token === "string" ? body.token : "";
  const claims = client && token.length < 8000 ? await verifySiteCall(admin, client, purpose, token) : null;
  return claims ? { client, claims } : null;
}

/** Stores a one-time ticket (only its hash) and returns the ticket. */
export async function issueTicket(admin: SupabaseClient, t: { client: string; direction: "to_site" | "to_hub"; userId?: string; email?: string; name?: string; nonce: string; browserHash?: string }) {
  const code = newCode();
  const { error } = await admin.from("sso_codes").insert({
    code_hash: sha256(code), client: t.client, direction: t.direction, user_id: t.userId ?? null, email: t.email ?? null, name: t.name ?? null,
    nonce: t.nonce, browser_hash: t.browserHash ?? null, expires_at: new Date(Date.now() + TICKET_SECONDS * 1000).toISOString(),
  });
  return error ? null : code;
}

type Ticket = { client: string; direction: string; user_id: string | null; email: string | null; name: string | null; nonce: string; browser_hash: string | null };

/** Uses a ticket up: one statement marks it used only if it is unused and not expired, so a second use always fails. */
export async function consumeTicket(admin: SupabaseClient, code: string, client: string, direction: "to_site" | "to_hub"): Promise<Ticket | null> {
  if (!validNonce(code)) return null;
  const { data, error } = await admin.from("sso_codes")
    .update({ used_at: new Date().toISOString() })
    .eq("code_hash", sha256(code)).eq("client", client).eq("direction", direction)
    .is("used_at", null).gt("expires_at", new Date().toISOString())
    .select("client, direction, user_id, email, name, nonce, browser_hash");
  return !error && data?.length === 1 ? (data[0] as Ticket) : null;
}

/** Looks at a ticket without using it (the first step of signing in to the hub). */
export async function peekTicket(admin: SupabaseClient, code: string, direction: "to_hub"): Promise<Ticket | null> {
  if (!validNonce(code)) return null;
  const { data } = await admin.from("sso_codes").select("client, direction, user_id, email, name, nonce, browser_hash")
    .eq("code_hash", sha256(code)).eq("direction", direction).is("used_at", null).gt("expires_at", new Date().toISOString()).maybeSingle();
  return (data as Ticket | null) ?? null;
}

/** The member's private code for one site (made the first time they sign in there). */
export async function linkSub(admin: SupabaseClient, client: string, userId: string): Promise<string | null> {
  const now = new Date().toISOString();
  const { data } = await admin.from("ecosystem_links").upsert({ client, user_id: userId, last_seen_at: now }, { onConflict: "client,user_id" }).select("sub").single();
  return (data?.sub as string | undefined) ?? null;
}

export async function userForSub(admin: SupabaseClient, client: string, sub: string): Promise<string | null> {
  if (!validSub(sub)) return null;
  const { data } = await admin.from("ecosystem_links").select("user_id").eq("client", client).eq("sub", sub).maybeSingle();
  return (data?.user_id as string | undefined) ?? null;
}

/** Logout everywhere: from now on every other site's session for this member ends at its next check. */
export async function recordSignout(admin: SupabaseClient, userId: string) {
  await admin.from("member_signouts").upsert({ user_id: userId, signed_out_at: new Date().toISOString() }, { onConflict: "user_id" });
}

/** Is a site session that started at `since` (seconds) still good? */
export async function sessionActive(admin: SupabaseClient, userId: string, since: number): Promise<{ active: boolean; reason?: string }> {
  if (!(await switchOn(admin, "sso"))) return { active: false, reason: "switch_off" };
  const [{ data: p }, { data: s }] = await Promise.all([
    admin.from("profiles").select("status").eq("id", userId).maybeSingle(),
    admin.from("member_signouts").select("signed_out_at").eq("user_id", userId).maybeSingle(),
  ]);
  if (!p || p.status !== "active") return { active: false, reason: "not_active" };
  if (s && new Date(s.signed_out_at as string).getTime() / 1000 > since) return { active: false, reason: "signed_out" };
  return { active: true };
}

/**
 * Tells the sites right away (best effort) to drop cached badges: for one member, or for everyone (`sub` "*").
 * If a notice is lost, the sites' own 10-minute re-check still removes the badge.
 */
export async function notifySites(admin: SupabaseClient, userId: string | null, purpose: "consent_off_notice" | "switch_change") {
  await Promise.all(V2_CLIENTS.map(async (client) => {
    let sub = "*";
    if (userId) {
      const { data } = await admin.from("ecosystem_links").select("sub").eq("client", client).eq("user_id", userId).maybeSingle();
      if (!data?.sub) return;
      sub = data.sub as string;
    }
    const token = signHubMessage(client, "hub-notice", { what: "badge-drop", sub, jti: newCode().slice(0, 32) });
    if (!token) return;
    const url = new URL("/auth/flame/notice", CLIENTS[client].callback).toString();
    const ok = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ token }), signal: AbortSignal.timeout(4000), cache: "no-store" })
      .then((r) => r.ok).catch(() => false);
    await log(admin, client, userId, purpose, [], ok ? "ok" : "refused", ok ? undefined : "notice_not_delivered");
  }));
}
