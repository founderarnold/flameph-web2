// Phase 13: a tiny stand-in for Supabase, so the member screens of a LOCAL copy of flameph.org can be opened as a
// signed-in sample member without touching the live database or anyone's password.
// Every table answers with no rows, except the sample member's own profile; unread messages answer 3, so the
// Messages count is visible. Used by scripts/release/member-shell.mjs. Never point the live site at this.

import http from "node:http";

export const SAMPLE_USER = {
  id: "00000000-0000-4000-8000-00000000a113", aud: "authenticated", role: "authenticated", email: "sample.member@example.test",
  email_confirmed_at: "2026-10-01T00:00:00Z", created_at: "2026-10-01T00:00:00Z", app_metadata: { provider: "email" }, user_metadata: { full_name: "Sample Member" },
};
export const SAMPLE_PROFILE = {
  id: SAMPLE_USER.id, full_name: "Sample Member", member_code: "FLM-SAMPLE", status: "active", tier: "free", member_type: "business",
  created_at: "2026-10-01T00:00:00Z", onboarded_at: "2026-10-01T00:00:00Z", province: "Metro Manila", city: "Quezon City", region: "NCR",
  consent_privacy: true, consent_marketing: false, hide_from_suggestions: true, closed_at: null, avatar_url: null, business_name: "Sample Store",
};
export const UNREAD = 3;

const b64url = (s) => Buffer.from(s).toString("base64url");
const jwt = (payload) => `${b64url(JSON.stringify({ alg: "HS256", typ: "JWT" }))}.${b64url(JSON.stringify(payload))}.sig`;

/** The @supabase/ssr session cookie for the sample member (cookie name sb-<first label of host>-auth-token). */
export function sessionCookie(port) {
  const exp = Math.floor(Date.now() / 1000) + 24 * 3600;
  const session = { access_token: jwt({ sub: SAMPLE_USER.id, role: "authenticated", aud: "authenticated", exp, email: SAMPLE_USER.email }), refresh_token: "sample-refresh", token_type: "bearer", expires_in: 86400, expires_at: exp, user: SAMPLE_USER };
  return { name: "sb-127-auth-token", value: `base64-${Buffer.from(JSON.stringify(session)).toString("base64url")}`, url: `http://127.0.0.1:${port}` };
}

export function startMock(port) {
  const server = http.createServer((req, res) => {
    const u = new URL(req.url, "http://x");
    const send = (code, body, headers = {}) => { res.writeHead(code, { "content-type": "application/json", ...headers }); res.end(body === undefined ? "" : JSON.stringify(body)); };
    let raw = ""; req.on("data", (c) => (raw += c));
    req.on("end", () => {
      if (u.pathname === "/auth/v1/user") return send(200, SAMPLE_USER);
      if (u.pathname.startsWith("/auth/v1/")) return send(200, {});
      if (u.pathname.startsWith("/rest/v1/rpc/")) {
        const fn = u.pathname.slice("/rest/v1/rpc/".length);
        if (fn === "unread_direct_messages") return send(200, UNREAD);
        if (fn === "has_staff_role" || fn === "is_staff") return send(200, false);
        return send(200, null);
      }
      if (u.pathname.startsWith("/rest/v1/")) {
        const table = u.pathname.slice("/rest/v1/".length);
        const single = (req.headers.accept || "").includes("vnd.pgrst.object");
        const rows = table === "profiles" ? [SAMPLE_PROFILE] : [];
        const range = { "content-range": rows.length ? `0-${rows.length - 1}/${rows.length}` : "*/0" };
        if (req.method === "HEAD") return send(200, undefined, range);
        if (req.method !== "GET") return send(201, single ? {} : []);
        if (single) return rows.length ? send(200, rows[0], range) : send(406, { code: "PGRST116", message: "no rows", details: "", hint: null });
        return send(200, rows, range);
      }
      if (u.pathname.startsWith("/storage/")) return send(404, { error: "not found" });
      return send(404, {});
    });
  });
  return new Promise((ok) => server.listen(port, "127.0.0.1", () => ok(server)));
}
