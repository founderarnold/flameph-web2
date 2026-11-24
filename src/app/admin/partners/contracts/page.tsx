import Link from "next/link";
import { adminContext } from "@/lib/admin/guard";
import { Notice } from "@/components/ui";
import { PartnerTabs } from "@/components/admin/PartnerTabs";
import { CONTRACT_CATEGORIES, CONTRACT_ERRORS, CONTRACT_LIST_COLS, CONTRACT_STATUS, PART_KEYS, daysLeft, renewalState, type ContractCategory, type ContractStatus } from "@/lib/contracts";

export const metadata = { title: "Partner contracts", robots: { index: false } };

type Row = { id: string; ref_no: string; partner_name: string; category: ContractCategory; status: ContractStatus; revision: number; effective_date: string | null; end_date: string | null; renewal_notice_days: number; signed_at: string | null; sent_at: string | null; updated_at: string };
const FILTERS: [string, string, ContractStatus[] | null][] = [
  ["open", "Being prepared or signed", ["draft", "out_for_signing", "partner_signed"]],
  ["signed", "Signed", ["signed"]],
  ["renewal", "Ending soon", null],
  ["closed", "Ended, terminated or cancelled", ["ended", "terminated", "cancelled"]],
  ["all", "All", null],
];
const day = (s: string | null) => (s ? new Date(`${s}T00:00:00+08:00`).toLocaleDateString("en-PH", { timeZone: "Asia/Manila", dateStyle: "medium" }) : "—");
const TONE = { ok: "bg-ok-soft text-ok", info: "bg-primary-soft text-primary", warn: "bg-warn-soft text-warn", danger: "bg-danger-soft text-danger" } as const;
const manila = () => new Date(Date.now() + 8 * 3600_000).toISOString().slice(0, 10);

/** Partner contracts for the national team: prepared from what is on record, checked by a person, signed by both
 *  sides, with renewal alerts. Templates are kept on their own page, and need a lawyer's review before use. */
export default async function ContractsAdmin({ searchParams }: { searchParams: Promise<{ show?: string; error?: string; done?: string }> }) {
  const sp = await searchParams;
  const ctx = await adminContext(["super_admin", "admin", "national_reviewer"]);
  const show = FILTERS.some(([k]) => k === sp.show) ? sp.show! : "open";
  const [{ data, error }, { data: tpls }, { data: es }] = await Promise.all([
    ctx.db.from("partner_contracts").select(CONTRACT_LIST_COLS).order("updated_at", { ascending: false }).limit(500),
    ctx.db.from("contract_templates").select("part, status"),
    ctx.db.from("settings").select("value").eq("key", "contract_esign").maybeSingle(),
  ]);
  const all = (data ?? []) as Row[];
  const today = manila();
  const due = (r: Row) => renewalState(r, today) !== "none";
  const filter = FILTERS.find(([k]) => k === show)!;
  const rows = show === "renewal" ? all.filter(due) : filter[2] ? all.filter((r) => filter[2]!.includes(r.status)) : all;
  const count = (k: string) => { const f = FILTERS.find(([x]) => x === k)!; return k === "renewal" ? all.filter(due).length : f[2] ? all.filter((r) => f[2]!.includes(r.status)).length : all.length; };
  const approved = new Set((tpls ?? []).filter((t) => t.status === "approved").map((t) => t.part));
  const esign = (es?.value ?? {}) as { enabled?: boolean; lawyer_name?: string | null };

  return (
    <div className="space-y-4">
      <PartnerTabs current="contracts" />
      <div>
        <h1 className="text-2xl font-extrabold text-primary">Partner contracts</h1>
        <p className="text-sm text-muted">Each contract is prepared from the partner&apos;s chosen Best Offer, territories and licence, checked by a person on the national team, then signed by the partner and by FLAME&apos;s signatory. Nothing is signed or sent automatically.</p>
      </div>
      {sp.error && <Notice tone="danger">{CONTRACT_ERRORS[sp.error] ?? CONTRACT_ERRORS.failed}</Notice>}
      {error && <Notice tone="warn">Contracts open after the database update (0038).</Notice>}
      <div className="grid gap-3 sm:grid-cols-3">
        <Link href="/admin/partners/contracts/new" className="btn btn-flame min-h-11">Prepare a contract</Link>
        <Link href="/admin/partners/contracts/templates" className="btn btn-outline min-h-11">Templates ({approved.size} of {PART_KEYS.length} parts lawyer-reviewed)</Link>
        <p className={`flex min-h-11 items-center justify-center rounded-xl px-3 text-center text-sm font-bold ${esign.enabled ? "bg-ok-soft text-ok" : "bg-warn-soft text-warn"}`}>{esign.enabled ? `Electronic signing ON (lawyer: ${esign.lawyer_name})` : "Electronic signing OFF (wet ink only)"}</p>
      </div>
      {approved.size < PART_KEYS.length && <Notice tone="warn">No contract can be sent until a lawyer has reviewed and the team has approved the template parts it needs. Open Templates to load the standard drafts and record each review.</Notice>}

      <nav aria-label="Filter contracts" className="flex gap-2 overflow-x-auto pb-1">
        {FILTERS.map(([k, l]) => (
          <Link key={k} href={`/admin/partners/contracts?show=${k}`} aria-current={k === show ? "page" : undefined} className="chip shrink-0">{l}<span className="text-muted"> {count(k)}</span></Link>
        ))}
      </nav>
      {rows.length === 0 ? <Notice tone="info">No contracts here.</Notice> : (
        <ul className="grid gap-3 md:grid-cols-2 2xl:grid-cols-3">
          {rows.map((r) => {
            const rs = renewalState(r, today);
            return (
              <li key={r.id} className="card space-y-1 p-4">
                <p className="text-xs font-bold uppercase text-muted">{r.ref_no} · version {r.revision} · {CONTRACT_CATEGORIES[r.category]}</p>
                <Link href={`/admin/partners/contracts/${r.id}`} className="block break-words text-lg font-extrabold text-primary underline">{r.partner_name}</Link>
                <span className={`inline-block rounded-full px-2.5 py-0.5 text-sm font-bold ${TONE[CONTRACT_STATUS[r.status].tone]}`}>{CONTRACT_STATUS[r.status].label}</span>
                <p className="text-sm">{day(r.effective_date)} to {day(r.end_date)}</p>
                {rs === "due" && r.end_date && <p className="text-sm font-bold text-warn">Ends in {daysLeft(r.end_date, today)} day(s): prepare the renewal.</p>}
                {rs === "expired" && <p className="text-sm font-bold text-danger">The end date has passed. Renew it or mark it ended.</p>}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
