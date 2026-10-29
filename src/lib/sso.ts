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

/** `secretEnv`: a site that has its own shared secret instead of SSO_SECRET (the same value is set in both projects). */
type Client = { callback: string; origins: string[]; secretEnv?: string };
export const CLIENTS: Record<string, Client> = {
  flamepos: {
    callback: "https://pos.flameph.org/auth/flame",
    origins: ["https://pos.flameph.org"],
    secretEnv: "SSO_SECRET_FLAMEPOS",
  },
  marketplaceph: { callback: "https://www.marketplaceph.com/auth/flame", origins: ["https://www.marketplaceph.com", "https://marketplaceph.com"] },
  negosyodepot: { callback: "https://www.negosyodepot.com/auth/flame", origins: ["https://www.negosyodepot.com", "https://negosyodepot.com"] },
  managerspizza: {
    callback: "https://www.managerspizza.com/auth/flame",
    origins: ["https://www.managerspizza.com", "https://managerspizza.com"],
    secretEnv: "SSO_SECRET_MANAGERSPIZZA",
  },
  flamephpages: {
    callback: "https://pages.flameph.org/auth/flame",
    origins: ["https://pages.flameph.org"],
    secretEnv: "SSO_SECRET_FLAMEPHPAGES",
  },
};

export type SsoClaims = { iss: string; aud: string; email: string; name?: string; iat: number; exp: number };

/** The secret shared with one site (its own, or SSO_SECRET). */
const secret = (client?: string) => {
  const env = (client && CLIENTS[client]?.secretEnv) || "SSO_SECRET";
  const s = process.env[env];
  return s && s.length >= 32 ? s : null; // refuse to run with a missing or weak secret
};
export const ssoEnabled = (client?: string) => secret(client) !== null;
/** The site at the other end of a token: the audience when the hub signs, the issuer when a site signs. */
const peer = (c: { iss?: string; aud: string }) => (c.aud === HUB ? c.iss : c.aud);

const b64 = (b: Buffer | string) => Buffer.from(b).toString("base64url");
const mac = (key: string, data: string) => createHmac("sha256", key).update(data).digest();

export function signToken(c: Omit<SsoClaims, "iat" | "exp">, ttlSeconds = 120): string {
  const key = secret(peer(c));
  if (!key) throw new Error("SSO secret is not set");
  const now = Math.floor(Date.now() / 1000);
  const body = b64(JSON.stringify({ ...c, email: c.email.toLowerCase(), iat: now, exp: now + ttlSeconds }));
  return `v1.${body}.${b64(mac(key, body))}`;
}

export function verifyToken(token: string, expect: { iss?: string; aud: string }): SsoClaims | null {
  const key = secret(peer(expect));
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
