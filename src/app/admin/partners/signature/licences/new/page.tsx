import Link from "next/link";
import { adminContext } from "@/lib/admin/guard";
import { Notice } from "@/components/ui";
import { PartnerTabs } from "@/components/admin/PartnerTabs";
import { SubmitButton } from "@/components/SubmitButton";
import { SIGNATURE_ADMIN_ERRORS, SIGNATURE_CATEGORIES, type SignatureCategory } from "@/lib/signature";
import { createLicence } from "../../actions";

export const metadata = { title: "New FLAME Signature licence", robots: { index: false } };

/** Starts a draft licence from a FLAME Signature proposal that was chosen as a Best Offer (both reviews cleared). */
export default async function NewLicence({ searchParams }: { searchParams: Promise<{ error?: string; offer?: string }> }) {
  const sp = await searchParams;
  const ctx = await adminContext(["super_admin", "admin", "national_reviewer"]);
  const { data } = await ctx.db.from("supplier_offers").select("id, user_id, title, signature_category, decided_at").eq("kind", "manufacturer").eq("status", "selected").order("decided_at", { ascending: false }).limit(200);
  const offers = (data ?? []) as { id: string; user_id: string; title: string | null; signature_category: SignatureCategory | null; decided_at: string | null }[];
  const { data: profs } = offers.length ? await ctx.db.from("partner_profiles").select("user_id, legal_name").in("user_id", [...new Set(offers.map((o) => o.user_id))]) : { data: [] };
  const nameOf = new Map((profs ?? []).map((p) => [p.user_id, p.legal_name as string]));

  return (
    <div className="space-y-4">
      <PartnerTabs current="signature" />
      <p className="text-sm"><Link href="/admin/partners/signature" className="underline">← FLAME Signature</Link></p>
      <h1 className="text-2xl font-extrabold text-primary">New FLAME Signature licence</h1>
      {sp.error && <Notice tone="danger">{SIGNATURE_ADMIN_ERRORS[sp.error] ?? SIGNATURE_ADMIN_ERRORS.failed}</Notice>}
      {offers.length === 0 ? (
        <Notice tone="info">No FLAME Signature proposal has been chosen yet. A proposal is chosen on its review page, after the score passes and both the regulatory and the legal review clear it.</Notice>
      ) : (
        <form action={createLicence} className="card space-y-4 p-4 sm:p-6">
          <div className="field">
            <label htmlFor="offer_id" className="label">Chosen proposal</label>
            <select id="offer_id" name="offer_id" required defaultValue={sp.offer ?? ""} className="input">
              <option value="" disabled>Choose…</option>
              {offers.map((o) => <option key={o.id} value={o.id}>{nameOf.get(o.user_id) ?? "—"} · {o.title ?? "(no name)"}{o.signature_category ? ` · ${SIGNATURE_CATEGORIES[o.signature_category]}` : ""}</option>)}
            </select>
            <p className="field-help">Next you choose the approved products, plants, manufacturing rights, distribution rights and dates. It stays a draft until you activate it.</p>
          </div>
          <SubmitButton className="btn btn-flame min-h-11 w-full sm:w-auto" pendingText="Starting…">Start the licence</SubmitButton>
        </form>
      )}
    </div>
  );
}
