import { NextResponse } from "next/server";
import { adminContext } from "@/lib/admin/guard";

const csv = (rows: Record<string, unknown>[]) => {
  if (!rows.length) return "";
  const cols = [...new Set(rows.flatMap((r) => Object.keys(r)))];
  const esc = (v: unknown) => { const s = v == null ? "" : typeof v === "object" ? JSON.stringify(v) : String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  return [cols.join(","), ...rows.map((r) => cols.map((c) => esc(r[c])).join(","))].join("\n");
};

export async function GET(req: Request, { params }: { params: Promise<{ kind: string }> }) {
  const { kind } = await params;
  const { db, audit } = await adminContext(["super_admin", "admin"]);
  const url = new URL(req.url);
  let rows: Record<string, unknown>[] = [];
  if (kind === "members") {
    const [{ data: profiles }, users] = await Promise.all([db.from("profiles").select("*").order("created_at"), db.auth.admin.listUsers({ perPage: 1000 })]);
    const byId = new Map((users.data?.users ?? []).map((u) => [u.id, u]));
    rows = (profiles ?? []).map((p) => ({ member_code: p.member_code, full_name: p.full_name, email: byId.get(p.id)?.email, email_verified: Boolean(byId.get(p.id)?.email_confirmed_at), mobile: p.mobile, province: p.province, city: p.city, business_stage: p.business_stage, tier: p.tier, status: p.status, consent_marketing: p.consent_marketing, created_at: p.created_at }));
  } else if (kind === "submissions") {
    let q = db.from("submissions").select("*").order("created_at", { ascending: false });
    if (url.searchParams.get("type")) q = q.eq("type", url.searchParams.get("type")!);
    if (url.searchParams.get("status")) q = q.eq("status", url.searchParams.get("status")!);
    const { data } = await q;
    rows = (data ?? []).map((r) => { const { data: d, ...rest } = r; delete (rest as Record<string, unknown>).ip_hash; return { ...rest, ...(d as object) }; });
  } else if (kind === "newsletter") {
    const { data } = await db.from("newsletter_subscribers").select("email,confirmed_at,unsubscribed_at,created_at").not("confirmed_at", "is", null);
    rows = data ?? [];
  } else return NextResponse.json({ error: "Unknown export" }, { status: 404 });
  await audit("export", kind, undefined, { count: rows.length });
  return new NextResponse(csv(rows), { headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="flameph-${kind}-${new Date().toISOString().slice(0, 10)}.csv"` } });
}
