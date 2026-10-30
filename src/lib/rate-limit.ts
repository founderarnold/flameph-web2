import "server-only";
import { createHash } from "crypto";
import { createAdminClient } from "@/lib/supabase/server";

export type RateLimitAction = "business_submit" | "inquiry" | "newsletter" | "otp_request" | "otp_verify_failure" | "public_form" | "signup";

type LimitConfig = { limit: number; windowSeconds: number; blockSeconds: number };
type RateLimitResult = { allowed: boolean; remaining: number; retryAfter: number; keyHash: string };

const positiveInt = (name: string, fallback: number, max: number) => {
  const value = Number.parseInt(process.env[name] ?? "", 10);
  return Number.isFinite(value) && value > 0 ? Math.min(value, max) : fallback;
};

// One central configuration surface. Environment variables can tune limits
// without a code deploy; safe defaults match the Phase 10 policy.
export const RATE_LIMITS: Record<RateLimitAction, LimitConfig> = {
  signup: { limit: positiveInt("RATE_LIMIT_SIGNUP_MAX", 3, 100), windowSeconds: positiveInt("RATE_LIMIT_SIGNUP_WINDOW_SECONDS", 3600, 86400), blockSeconds: 0 },
  business_submit: { limit: positiveInt("RATE_LIMIT_BUSINESS_MAX", 5, 100), windowSeconds: positiveInt("RATE_LIMIT_BUSINESS_WINDOW_SECONDS", 86400, 604800), blockSeconds: 0 },
  otp_request: { limit: positiveInt("RATE_LIMIT_OTP_MAX", 5, 100), windowSeconds: positiveInt("RATE_LIMIT_OTP_WINDOW_SECONDS", 3600, 86400), blockSeconds: 0 },
  otp_verify_failure: {
    limit: positiveInt("RATE_LIMIT_OTP_FAILURE_MAX", 5, 100),
    windowSeconds: positiveInt("RATE_LIMIT_OTP_FAILURE_WINDOW_SECONDS", 900, 86400),
    blockSeconds: positiveInt("RATE_LIMIT_OTP_COOLDOWN_SECONDS", 900, 86400),
  },
  public_form: { limit: positiveInt("RATE_LIMIT_PUBLIC_FORM_MAX", 10, 200), windowSeconds: positiveInt("RATE_LIMIT_PUBLIC_FORM_WINDOW_SECONDS", 3600, 86400), blockSeconds: 0 },
  inquiry: { limit: positiveInt("RATE_LIMIT_INQUIRY_MAX", 5, 100), windowSeconds: positiveInt("RATE_LIMIT_INQUIRY_WINDOW_SECONDS", 86400, 604800), blockSeconds: 0 },
  newsletter: { limit: positiveInt("RATE_LIMIT_NEWSLETTER_MAX", 5, 100), windowSeconds: positiveInt("RATE_LIMIT_NEWSLETTER_WINDOW_SECONDS", 3600, 86400), blockSeconds: 0 },
};

function requestIp(req: Request) {
  return (req.headers.get("cf-connecting-ip") || req.headers.get("x-forwarded-for") || req.headers.get("x-real-ip") || "unknown")
    .split(",")[0].trim();
}

function hashKey(action: RateLimitAction, rawKey: string) {
  const salt = process.env.IP_HASH_SALT?.trim() || (process.env.NODE_ENV === "development" ? "flameph-development-only" : "");
  if (!salt) return null;
  return createHash("sha256").update(`${action}|${rawKey}|${salt}`).digest("hex");
}

export function rateLimitKey(req: Request, action: RateLimitAction, identifier?: string) {
  const rawKey = identifier?.trim().toLowerCase() || requestIp(req);
  return hashKey(action, rawKey);
}

export async function checkRateLimit(req: Request, action: RateLimitAction, options?: { identifier?: string; increment?: boolean }): Promise<RateLimitResult | null> {
  const admin = createAdminClient();
  if (!admin) return null;
  const config = RATE_LIMITS[action];
  const keyHash = rateLimitKey(req, action, options?.identifier);
  if (!keyHash) return null;
  const { data, error } = await admin.rpc("consume_rate_limit", {
    p_action: action,
    p_key_hash: keyHash,
    p_limit: config.limit,
    p_window_seconds: config.windowSeconds,
    p_block_seconds: config.blockSeconds,
    p_increment: options?.increment !== false,
  });
  if (error || !data || typeof data !== "object") return null;
  const value = data as Record<string, unknown>;
  return {
    allowed: value.allowed === true,
    remaining: typeof value.remaining === "number" ? value.remaining : 0,
    retryAfter: typeof value.retry_after === "number" ? value.retry_after : config.windowSeconds,
    keyHash,
  };
}

export async function clearRateLimit(action: RateLimitAction, keyHash: string) {
  const admin = createAdminClient();
  if (!admin) return false;
  const { error } = await admin.rpc("clear_rate_limit", { p_action: action, p_key_hash: keyHash });
  return !error;
}

export const retryAfterHeaders = (seconds: number) => ({ "retry-after": String(Math.max(1, Math.ceil(seconds))) });
