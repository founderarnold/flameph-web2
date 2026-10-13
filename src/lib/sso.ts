import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * One account across the FLAME PH ecosystem. flameph.org is the hub: other sites ask it "who is this visitor?"
 * (/sso/authorize) and tell it "this visitor just signed in here" (/sso/establish). Messages are short-lived tokens
 * signed with SSO_SECRET, a long random value shared by every site's Vercel project. Accounts are matched by
 * verified email; each site keeps its own Supabase project.
 */

export const HUB = "flameph";

type Client = { callback: string; origins: string[] };
export const CLIENTS: Record<string, Client> = {
  marketplaceph: { callback: "https://www.marketplaceph.com/auth/flame", origins: ["https://www.marketplaceph.com", "https://marketplaceph.com"] },
  negosyodepot: { callback: "https://www.negosyodepot.com/auth/flame", origins: ["https://www.negosyodepot.com", "https://negosyodepot.com"] },
};

export type SsoClaims = { iss: string; aud: string; email: string; name?: string; iat: number; exp: number };

const secret = () => {
  const s = process.env.SSO_SECRET;
  return s && s.length >= 32 ? s : null; // refuse to run with a missing or weak secret
};
export const ssoEnabled = () => secret() !== null;

const b64 = (b: Buffer | string) => Buffer.from(b).toString("base64url");
const mac = (key: string, data: string) => createHmac("sha256", key).update(data).digest();

export function signToken(c: Omit<SsoClaims, "iat" | "exp">, ttlSeconds = 120): string {
  const key = secret();
  if (!key) throw new Error("SSO_SECRET is not set");
  const now = Math.floor(Date.now() / 1000);
  const body = b64(JSON.stringify({ ...c, email: c.email.toLowerCase(), iat: now, exp: now + ttlSeconds }));
  return `v1.${body}.${b64(mac(key, body))}`;
}

export function verifyToken(token: string, expect: { iss?: string; aud: string }): SsoClaims | null {
  const key = secret();
  const [v, body, sig] = token.split(".");
  if (!key || v !== "v1" || !body || !sig) return null;
  const want = mac(key, body);
  const got = Buffer.from(sig, "base64url");
  if (got.length !== want.length || !timingSafeEqual(got, want)) return null;
  try {
    const c = JSON.parse(Buffer.from(body, "base64url").toString()) as SsoClaims;
    const now = Math.floor(Date.now() / 1000);
    if (c.aud !== expect.aud || (expect.iss && c.iss !== expect.iss) || !(c.exp > now) || c.iat > now + 30) return null;
    if (typeof c.email !== "string" || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(c.email)) return null;
    return c;
  } catch {
    return null;
  }
}

/** A return address is allowed only on a known site of that client. */
export function allowedReturn(client: string, url: string | null): string | null {
  const c = CLIENTS[client];
  if (!c || !url) return null;
  try {
    const u = new URL(url);
    return c.origins.includes(u.origin) ? u.toString() : null;
  } catch {
    return null;
  }
}

/**
 * Signs the visitor into this site as the account with this verified email, creating it if needed.
 * `admin` is the service-role client; `session` is the cookie-bound client that receives the session.
 */
export async function signInByEmail(admin: SupabaseClient, session: SupabaseClient, email: string, name?: string): Promise<boolean> {
  const created = await admin.auth.admin.createUser({ email, email_confirm: true, user_metadata: name ? { full_name: name } : {} });
  if (created.error && !/already|registered|exists/i.test(created.error.message)) return false;
  const link = await admin.auth.admin.generateLink({ type: "magiclink", email });
  const hash = link.data?.properties?.hashed_token;
  if (link.error || !hash) return false;
  const { error } = await session.auth.verifyOtp({ token_hash: hash, type: "magiclink" });
  return !error;
}
