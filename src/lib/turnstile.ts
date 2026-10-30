import "server-only";

export type TurnstileAction = "business_submit" | "inquiry" | "newsletter" | "public_form";

type SiteverifyResponse = {
  success?: boolean;
  action?: string;
  hostname?: string;
  "error-codes"?: string[];
};

export type TurnstileResult =
  | { ok: true }
  | { ok: false; status: 400 | 503; error: string };

const VERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

function requestIp(req: Request) {
  return (req.headers.get("cf-connecting-ip") || req.headers.get("x-forwarded-for") || req.headers.get("x-real-ip") || "")
    .split(",")[0].trim();
}

function allowedHostnames() {
  const explicit = (process.env.TURNSTILE_ALLOWED_HOSTNAMES ?? "").split(",").map((x) => x.trim().toLowerCase()).filter(Boolean);
  if (explicit.length) return explicit;
  try {
    const hostname = new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "").hostname.toLowerCase();
    return hostname ? [hostname] : [];
  } catch {
    return [];
  }
}

/** Validate a single-use Turnstile token on the server before any protected write. */
export async function verifyTurnstile(req: Request, token: unknown, expectedAction: TurnstileAction): Promise<TurnstileResult> {
  const secret = process.env.TURNSTILE_SECRET_KEY?.trim();
  const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY?.trim();

  // Local development remains usable without credentials. Production and
  // preview deployments fail closed if either side of the pair is missing.
  if (!secret || !siteKey) {
    if (process.env.NODE_ENV === "development" && token === "development-bypass") return { ok: true };
    return { ok: false, status: 503, error: "Bot protection is not configured. Please try again later." };
  }
  if (typeof token !== "string" || !token || token.length > 2048) {
    return { ok: false, status: 400, error: "Please complete the security check." };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    const form = new FormData();
    form.set("secret", secret);
    form.set("response", token);
    const ip = requestIp(req);
    if (ip) form.set("remoteip", ip);
    form.set("idempotency_key", crypto.randomUUID());

    const response = await fetch(VERIFY_URL, { method: "POST", body: form, signal: controller.signal, cache: "no-store" });
    if (!response.ok) return { ok: false, status: 503, error: "The security check is temporarily unavailable. Please try again." };
    const result = await response.json() as SiteverifyResponse;
    if (!result.success || result.action !== expectedAction) {
      return { ok: false, status: 400, error: "Security check expired or failed. Please try again." };
    }

    const hosts = allowedHostnames();
    const usingCloudflareTestSecret = process.env.NODE_ENV !== "production" && /^[123]x0+AA$/.test(secret);
    if (hosts.length && !usingCloudflareTestSecret && (!result.hostname || !hosts.includes(result.hostname.toLowerCase()))) {
      return { ok: false, status: 400, error: "Security check could not be validated for this site." };
    }
    return { ok: true };
  } catch {
    return { ok: false, status: 503, error: "The security check is temporarily unavailable. Please try again." };
  } finally {
    clearTimeout(timeout);
  }
}
