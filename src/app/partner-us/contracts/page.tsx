import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { Notice } from "@/components/ui";
import { CONTRACT_CATEGORIES, CONTRACT_ERRORS, CONTRACT_LIST_COLS, CONTRACT_STATUS, type ContractCategory, type ContractStatus } from "@/lib/contracts";

export const metadata = { title: "My partner contracts", robots: { index: false } };

type Row = { id: string; ref_no: string; partner_name: string; category: ContractCategory; status: ContractStatus; revision: number; effective_date: string | null; end_date: string | null };
const day = (s: string | null) => (s ? new Date(`${s}T00:00:00+08:00`).toLocaleDateString("en-PH", { timeZone: "Asia/Manila", dateStyle: "medium" }) : "—");
const TONE = { ok: "bg-ok-soft text-ok", info: "bg-primary-soft text-primary", warn: "bg-warn-soft text-warn", danger: "bg-danger-soft text-danger" } as const;

/** The accredited partner's contracts with MarketplacePH Online Store: to read, sign or ask for changes, and to keep. */
export default async function MyContracts({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const sp = await searchParams;
  const { supabase, user } = await requireUser("/partner-us/contracts");
  const { data, error } = await supabase.from("partner_contracts").select(CONTRACT_LIST_COLS).eq("partner_user_id", user.id).order("updated_at", { ascending: false });
  const rows = (data ?? []) as Row[];
  const waiting = rows.filter((r) => r.status === "out_for_signing").length;

  return (
    <div className="container-x max-w-3xl space-y-5 py-6 sm:py-10">
      <nav aria-label="Breadcrumb" className="text-sm text-muted"><Link href="/partner-us" className="underline">Become an Accredited Partner</Link> › Contracts</nav>
      <header>
        <p className="font-display font-bold text-flame-strong" lang="fil">Para sa accredited partners</p>
        <h1 className="text-3xl font-extrabold text-primary">My partner contracts</h1>
        <p className="mt-1 text-muted">Your agreements with MarketplacePH Online Store, the Operator of the FLAME PH ecosystem. Read every part before you sign. If something is wrong, ask for changes instead of signing.</p>
        <p className="mt-1 text-sm text-muted" lang="fil">Basahin ang buong kontrata bago pumirma. Kung may mali, humingi ng pagbabago.</p>
      </header>
      {sp.error && <div role="alert"><Notice tone="danger">{CONTRACT_ERRORS[sp.error] ?? CONTRACT_ERRORS.failed}</Notice></div>}
      {error && <Notice tone="warn">{CONTRACT_ERRORS.unavailable}</Notice>}
      {waiting > 0 && <Notice tone="warn">{waiting} contract{waiting === 1 ? " is" : "s are"} waiting for your signature.</Notice>}
      {rows.length === 0 && !error ? (
        <Notice tone="info">No contract yet. After the national team chooses your Best Offer (and, for territories or FLAME Signature, approves them), they prepare your contract here.</Notice>
      ) : (
        <ul className="space-y-3">
          {rows.map((r) => (
            <li key={r.id} className="card flex flex-col gap-2 p-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <p className="text-xs font-bold uppercase text-muted">{r.ref_no} · version {r.revision} · {CONTRACT_CATEGORIES[r.category]}</p>
                <span className={`mt-1 inline-block rounded-full px-2.5 py-0.5 text-sm font-bold ${TONE[CONTRACT_STATUS[r.status].tone]}`}>{r.status === "draft" ? "Being revised by the team" : CONTRACT_STATUS[r.status].label}</span>
                <p className="text-sm">{day(r.effective_date)} to {day(r.end_date)}</p>
              </div>
              <Link href={`/partner-us/contracts/${r.id}`} className="btn btn-primary min-h-11 w-full sm:w-auto">{r.status === "out_for_signing" ? "Read and sign" : "Open"}</Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
