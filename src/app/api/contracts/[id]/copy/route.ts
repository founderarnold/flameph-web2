import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { CONTRACT_COLS, SIGNATURE_COLS, type ContractRow, type SignatureRow } from "@/lib/contracts";

export const dynamic = "force-dynamic";

const deny = (status: number) => new NextResponse(status === 404 ? "Not found" : "Not allowed", { status, headers: { "Cache-Control": "no-store" } });

/**
 * A plain-text copy of one partner contract (0038): the frozen text exactly as sent, its SHA-256 fingerprint, and the
 * signatures on that version. Read with the viewer's own session, so the database rules decide who may open it: the
 * partner (own contract, once sent) and the national team. Never cached.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return deny(404);
  const { supabase, user } = await getSession();
  if (!supabase || !user) return deny(401);
  const [{ data }, { data: sigRows }] = await Promise.all([
    supabase.from("partner_contracts").select(CONTRACT_COLS).eq("id", id).maybeSingle(),
    supabase.from("partner_contract_signatures").select(SIGNATURE_COLS).eq("contract_id", id).order("signed_at"),
  ]);
  if (!data) return deny(404);
  const c = data as unknown as ContractRow;
  if (!c.body) return deny(404);
  const sigs = ((sigRows ?? []) as SignatureRow[]).filter((s) => s.revision === c.revision);
  const when = (s: string) => new Date(s).toLocaleString("en-PH", { timeZone: "Asia/Manila", dateStyle: "medium", timeStyle: "short" });
  const lines = sigs.length === 0 ? ["No signature on this version yet."] : sigs.map((s) =>
    `${s.side === "partner" ? "Partner" : "MarketplacePH Online Store"}: ${s.signer_name}, ${s.signer_position} · ${s.method === "electronic" ? `signed electronically ${when(s.signed_at)}` : `signed on paper ${s.signed_on ?? ""}`} · text fingerprint ${s.body_sha256}`);
  const text = `${c.body}\n\n────────────────────────────────────────\nContract ${c.ref_no}, version ${c.revision}\nSHA-256 fingerprint of the text above: ${c.body_sha256}\n\nSignatures on this version:\n${lines.join("\n")}\n\nCopy downloaded ${when(new Date().toISOString())} (Philippine time).\n`;
  return new NextResponse(text, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Content-Disposition": `attachment; filename="${c.ref_no.replace(/[^A-Za-z0-9-]/g, "_")}-v${c.revision}.txt"`,
      "Cache-Control": "private, no-store, max-age=0",
      "X-Content-Type-Options": "nosniff",
      "X-Robots-Tag": "noindex",
    },
  });
}
