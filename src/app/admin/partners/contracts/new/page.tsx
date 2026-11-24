import Link from "next/link";
import { adminContext } from "@/lib/admin/guard";
import { Notice } from "@/components/ui";
import { PartnerTabs } from "@/components/admin/PartnerTabs";
import { SubmitButton } from "@/components/SubmitButton";
import { CONTRACT_CATEGORIES, CONTRACT_ERRORS, type ContractCategory } from "@/lib/contracts";
import { createContract } from "../actions";

export const metadata = { title: "Prepare a partner contract", robots: { index: false } };

/** Starts a draft contract for an accredited partner. The site fills in what is on record (approved application,
 *  chosen Best Offer, FLAME Signature licence, territories, default commission split) for the team to check. */
export default async function NewContract({ searchParams }: { searchParams: Promise<{ error?: string; m?: string; partner?: string }> }) {
  const sp = await searchParams;
  const ctx = await adminContext(["super_admin", "admin", "national_reviewer"]);
  const { data } = await ctx.db.from("partner_profiles").select("user_id, legal_name, categories").eq("status", "accredited").order("legal_name").limit(1000);
  const partners = ((data ?? []) as { user_id: string; legal_name: string; categories: ContractCategory[] }[]).filter((p) => p.user_id !== ctx.user.id);
  const err = sp.error === "db" && sp.m ? `The database refused: ${sp.m}.` : sp.error ? CONTRACT_ERRORS[sp.error] ?? CONTRACT_ERRORS.failed : null;

  return (
    <div className="space-y-4">
      <PartnerTabs current="contracts" />
      <p className="text-sm"><Link href="/admin/partners/contracts" className="underline">← Contracts</Link></p>
      <h1 className="text-2xl font-extrabold text-primary">Prepare a partner contract</h1>
      {err && <Notice tone="danger">{err}</Notice>}
      {partners.length === 0 ? <Notice tone="info">No accredited partner yet. A contract can be prepared after the national team accredits a supplier, service provider or toll manufacturer.</Notice> : (
        <form action={createContract} className="card space-y-4 p-4 sm:p-6">
          <div className="field">
            <label htmlFor="pc" className="label">Partner and category</label>
            <select id="pc" name="pick" required defaultValue="" className="input">
              <option value="" disabled>Choose…</option>
              {partners.flatMap((p) => p.categories.map((c) => <option key={`${p.user_id}:${c}`} value={`${p.user_id}:${c}`}>{p.legal_name} · {CONTRACT_CATEGORIES[c]}</option>))}
            </select>
            <p className="field-help">The draft is filled in from the approved application (legal name, registration, address, representative), the chosen Best Offer, the FLAME Signature licence and the partner&apos;s territories. You check and complete it next. A partner who already has a signed contract is renewed from that contract&apos;s page instead.</p>
          </div>
          <SubmitButton className="btn btn-flame min-h-11 w-full sm:w-auto" pendingText="Preparing…">Prepare the draft</SubmitButton>
        </form>
      )}
    </div>
  );
}
