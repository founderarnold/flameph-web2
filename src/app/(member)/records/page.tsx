import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { CountBadge, EmptyState, Notice } from "@/components/ui";
import { ConsentNeeded } from "@/components/RecordsConsentNeeded";
import { memberCards } from "@/lib/people";
import { badgeLevel, nextBadge, needsMyConfirm, otherParty, PAIR_CAP, RECORD_ERRORS, STATUS_LABEL, type TxRecord } from "@/lib/records";
import { recordsConsentOn, reputation } from "@/lib/records-server";

export const metadata = { title: "Transaction records", robots: { index: false } };

/** Transaction records: deals with other members. A record counts only after BOTH members confirm it. */
export default async function RecordsPage() {
  const { supabase, user } = await requireUser("/records");
  const [{ data, error }, rep, consentOn] = await Promise.all([
    supabase.from("transaction_records").select("*").or(`requester_id.eq.${user.id},provider_id.eq.${user.id}`).order("created_at", { ascending: false }).limit(100),
    reputation(supabase, user.id),
    recordsConsentOn(supabase, user.id),
  ]);
  const rows = (data ?? []) as TxRecord[];
  const cards = await memberCards(supabase, rows.map((r) => otherParty(r, user.id)));
  const waiting = rows.filter((r) => needsMyConfirm(r, user.id));
  const level = rep ? badgeLevel(rep.counted) : null;
  const next = rep ? nextBadge(rep.counted) : null;

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <Link href="/workspace" className="inline-flex min-h-11 items-center gap-1 font-semibold text-primary"><span aria-hidden>←</span> Workspace</Link>
      <div className="flex flex-wrap items-end justify-between gap-2">
        <h1 className="text-2xl font-extrabold sm:text-3xl">Transaction records</h1>
        <Link href="/requests" className="inline-flex min-h-11 items-center text-sm font-semibold text-primary underline">Requests and quotes</Link>
      </div>
      <p className="text-muted">A record is a deal you did with another member. It counts toward your badge and reputation only after <strong>both of you confirm</strong> it. FLAME PH never takes or holds money.</p>
      {!consentOn && <ConsentNeeded />}

      {rep && (
        <section aria-labelledby="rep-h" className="card space-y-2 p-4">
          <h2 id="rep-h" className="text-lg font-bold">Your reputation</h2>
          <dl className="grid grid-cols-3 gap-2 text-center">
            <div><dt className="text-xs text-muted">Counted records</dt><dd className="text-2xl font-extrabold">{rep.counted}</dd></div>
            <div><dt className="text-xs text-muted">Badge</dt><dd className="text-lg font-extrabold">{level ?? "None yet"}</dd></div>
            <div><dt className="text-xs text-muted">Rating</dt><dd className="text-lg font-extrabold">{rep.rating_avg ? `${rep.rating_avg} ★` : "None yet"}</dd></div>
          </dl>
          {next && <p className="text-sm text-muted">{next.min - rep.counted} more counted {next.min - rep.counted === 1 ? "record" : "records"} to reach {next.name}.</p>}
          <p className="text-sm text-muted">Only the first {PAIR_CAP} confirmed records with the same member count, until both businesses are vetted. {rep.vetted ? "Your business is vetted." : <>Get vetted in <Link href="/account/vetting" className="font-semibold text-primary underline">Business vetting</Link>.</>}</p>
        </section>
      )}

      {error ? <Notice tone="info">{RECORD_ERRORS.unavailable}</Notice> : rows.length === 0 ? (
        <EmptyState title="No records yet." text="Records open when you accept a member's quote, or a member accepts yours." cta={{ href: "/requests", label: "Requests and quotes" }} />
      ) : (
        <section aria-labelledby="list-h" className="space-y-2">
          <h2 id="list-h" className="flex items-center gap-2 text-lg font-bold">All records<CountBadge count={waiting.length} label="waiting for you" /></h2>
          <ul className="card divide-y divide-line">
            {rows.map((r) => {
              const other = cards.get(otherParty(r, user.id))?.name ?? "FLAME PH member";
              const mine = needsMyConfirm(r, user.id);
              return (
                <li key={r.id}>
                  <Link href={`/records/${r.id}`} className="block min-h-11 px-4 py-3 hover:bg-bg-soft">
                    <span className="flex items-baseline justify-between gap-2">
                      <span className={`truncate ${mine ? "font-extrabold" : "font-semibold"}`}>{r.description}</span>
                      <span className="shrink-0 text-xs text-muted">{r.deal_date}</span>
                    </span>
                    <span className="block truncate text-sm text-muted">With {other} · {r.category}</span>
                    <span className={`block text-xs ${mine ? "font-bold text-flame-strong" : "text-muted"}`}>{mine ? "Waiting for you to confirm" : STATUS_LABEL[r.status]}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </div>
  );
}
