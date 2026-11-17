import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { ORG } from "@/lib/site";
import type { UnsubTopic } from "@/lib/notification-prefs";

// One-click unsubscribe links. Each link is signed, so it only works for the member and the topic it was made for.
// The signing key is derived from an existing server secret (no new secret to set up). Links do not expire.

function key(): string | null {
  const base = process.env.SUPABASE_SERVICE_ROLE_KEY;
  return base ? createHmac("sha256", base).update("flameph-unsubscribe-v1").digest("hex") : null;
}

export function signUnsubscribe(userId: string, topic: UnsubTopic, secret = key()): string | null {
  if (!secret) return null;
  return createHmac("sha256", secret).update(`${userId}.${topic}`).digest("base64url").slice(0, 32);
}

export function verifyUnsubscribe(userId: string, topic: UnsubTopic, sig: string, secret = key()): boolean {
  const want = signUnsubscribe(userId, topic, secret);
  if (!want || typeof sig !== "string" || sig.length !== want.length) return false;
  return timingSafeEqual(Buffer.from(want), Buffer.from(sig));
}

/** The link printed in the email footer (opens a page with one confirm button). */
export function unsubscribeUrl(userId: string, topic: UnsubTopic): string | null {
  const s = signUnsubscribe(userId, topic);
  return s ? `${ORG.url}/unsubscribe?${new URLSearchParams({ u: userId, t: topic, s })}` : null;
}

/** Headers so email apps show their own "Unsubscribe" button (one click, RFC 8058). */
export function unsubscribeHeaders(userId: string, topic: UnsubTopic): Record<string, string> | undefined {
  const s = signUnsubscribe(userId, topic);
  if (!s) return undefined;
  const q = new URLSearchParams({ u: userId, t: topic, s });
  return { "List-Unsubscribe": `<${ORG.url}/api/unsubscribe?${q}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" };
}
