import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { Notice } from "@/components/ui";
import { SubmitButton } from "@/components/SubmitButton";
import { PartnerMoneyNotice } from "@/components/PartnerMoneyNotice";
import {
  APPOINT_RULE, CHANNELS, EXCLUSIVITY, MAX_OPEN_NOMINATIONS, NOMINATION_STATUS, ONLINE_SALES, OUTCOMES, php, RATINGS, REVIEW_EVERY, RIGHTS, shownStatus,
  TARGET_NOTE, TARGET_PERIOD, type Exclusivity, type NominationStatus, type OnlineSales, type Outcome, type Rating, type ReviewEvery, type TargetPeriod,
} from "@/lib/territory";
import { nominateSubPartner, withdrawNomination } from "./actions";

export const metadata = { title: "My territories", robots: { index: false } };

type Appt = {
  id: string; parent_id: string | null; category_label: string; rights: keyof typeof RIGHTS; exclusivity: Exclusivity; channels: string[]; online_sales: OnlineSales | null;
  online_note: string | null; excluded_accounts: string[]; start_date: string | null; end_date: string | null; target_period: TargetPeriod | null; target_net_sales: number | null;
  target_members: number | null; target_note: string | null; review_every: ReviewEvery | null; next_review_date: string | null; terms_note: string | null; status: string; status_reason: string | null;
};
type Area = { appointment_id: string; label: string };
type Review = { id: string; appointment_id: string; period_start: string; period_end: string; actual_net_sales: number | null; actual_members: number | null; rating: Rating; outcome: Outcome; note: string | null };
type Nom = { id: string; parent_id: string; nominee_name: string; proposed_area: string; status: NominationStatus; decision_note: string | null; created_at: string };
type Sub = { id: string; parent_id: string; legal_name: string | null; category_label: string; exclusivity: string; status: string; start_date: string | null; end_date: string | null; areas: string | null };

const day = (s: string | null) => (s ? new Date(`${s}T00:00:00+08:00`).toLocaleDateString("en-PH", { timeZone: "Asia/Manila", dateStyle: "medium" }) : "—");
const tone = (t: string) => ({ ok: "bg-ok-soft text-ok", warn: "bg-warn-soft text-warn", danger: "bg-danger-soft text-danger", info: "bg-primary-soft text-primary" })[t] ?? "bg-bg-soft";
const ERR: Record<string, string> = {
  not_yours: "You can nominate only inside your own active territory.", missing: "Fill in the business name, contact person and proposed area.",
  contact: "Give a phone number or an email for the nominee.", email: "Check the email address.", reason: "Say in a sentence or two why you nominate them.",
  agreed: "Tick the box to confirm the nominee agreed to be contacted by FLAME PH.", limit: `You have ${MAX_OPEN_NOMINATIONS} nominations waiting. Wait for a decision first.`,
  unavailable: "This isn't available right now. Please try again later.", failed: "That didn't go through. Please try again.",
};
const DONE: Record<string, string> = { nominated: "Nomination sent. The national team will decide and tell you.", withdrawn: "Nomination withdrawn." };

/** The partner's own territories (approved by the national team), their reviews, sub-partners and nominations. */
export default async function MyTerritories({ searchParams }: { searchParams: Promise<{ done?: string; error?: string }> }) {
  const sp = await searchParams;
  const { supabase, user } = await requireUser("/partner-us/territories");
  const [{ data: prof }, { data: rows, error }, { data: noms }, { data: subs }] = await Promise.all([
    supabase.from("partner_profiles").select("status, categories, legal_name").eq("user_id", user.id).maybeSingle(),
    supabase.from("territorial_appointments").select("id, parent_id, category_label, rights, exclusivity, channels, online_sales, online_note, excluded_accounts, start_date, end_date, target_period, target_net_sales, target_members, target_note, review_every, next_review_date, terms_note, status, status_reason").eq("partner_user_id", user.id).order("start_date", { ascending: false }),
    supabase.from("territory_nominations").select("id, parent_id, nominee_name, proposed_area, status, decision_note, created_at").eq("nominator_id", user.id).order("created_at", { ascending: false }).limit(50),
    supabase.rpc("my_sub_partners"),
  ]);
  const appts = (rows ?? []) as Appt[];
  const ids = appts.map((a) => a.id);
  const [{ data: areaRows }, { data: reviewRows }] = ids.length ? await Promise.all([
    supabase.from("territory_areas").select("appointment_id, label").in("appointment_id", ids),
    supabase.from("territory_reviews").select("id, appointment_id, period_start, period_end, actual_net_sales, actual_members, rating, outcome, note").in("appointment_id", ids).order("period_end", { ascending: false }),
  ]) : [{ data: [] }, { data: [] }];
  const areas = (areaRows ?? []) as Area[];
  const reviews = (reviewRows ?? []) as Review[];
  const nominations = (noms ?? []) as Nom[];
  const subPartners = (subs ?? []) as Sub[];
  const accredited = !!prof && prof.status === "accredited";
  const err = sp.error ? ERR[sp.error] ?? ERR.failed : error ? ERR.unavailable : null;
  const label = new Map(appts.map((a) => [a.id, a.category_label]));
  const Item = ({ k, v }: { k: string; v?: React.ReactNode }) => <div className="min-w-0"><dt className="text-xs font-bold uppercase text-muted">{k}</dt><dd className="break-words text-[15px]">{v || <span className="text-muted">—</span>}</dd></div>;

  return (
    <div className="container-x max-w-3xl space-y-5 py-6 sm:py-10">
      <nav aria-label="Breadcrumb" className="text-sm text-muted"><Link href="/partner-us" className="underline">Become an Accredited Partner</Link> › My territories</nav>
      <header>
        <p className="font-display font-bold text-flame-strong" lang="fil">Para sa accredited partners</p>
        <h1 className="text-3xl font-extrabold text-primary">My territories</h1>
        <p className="mt-1 text-muted">The areas where the FLAME PH national team appointed you, for which category, through which channels and until when.</p>
        <p className="mt-1 text-sm text-muted" lang="fil">Ang mga lugar kung saan kayo na-appoint ng national team, para sa anong produkto o serbisyo, at hanggang kailan.</p>
      </header>
      {sp.done && <div role="status"><Notice tone="ok">{DONE[sp.done] ?? "Saved."}</Notice></div>}
      {err && <div role="alert"><Notice tone="danger">{err}</Notice></div>}

      <section className="card p-4 sm:p-5" aria-labelledby="rule-h">
        <h2 id="rule-h" className="text-lg font-bold">How territories work</h2>
        <p className="mt-1 text-[15px] leading-6">{APPOINT_RULE.en}</p>
        <p className="mt-1 text-sm text-muted" lang="fil">{APPOINT_RULE.tl}</p>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-[15px] leading-6 text-muted">
          <li>Territories are usually given after your Best Offer is chosen. You do not apply for one here; the national team contacts you.</li>
          <li><strong>Exclusive</strong> means no other partner gets the same category, channels and dates in your area. <strong>Non-exclusive</strong> means others may be appointed too.</li>
          <li>Your performance is reviewed against the targets. Changes to an area happen only at renewal, never quietly.</li>
        </ul>
      </section>

      {!accredited && !error && (
        <section className="card space-y-3 border-2 border-flame p-5" aria-labelledby="not-h">
          <h2 id="not-h" className="text-lg font-bold">First, get accredited</h2>
          <p className="text-[15px] leading-6">Territories are only for accredited partners. Apply as a supplier, service provider or toll manufacturer first.</p>
          <p className="text-sm text-muted" lang="fil">Mag-apply muna bilang accredited partner.</p>
          <Link href="/partner-us#apply" className="btn btn-flame min-h-11 w-full sm:w-auto">Apply to become a partner</Link>
        </section>
      )}
      {accredited && appts.length === 0 && !error && <Notice tone="info">You have no territory yet. The national team will contact you when one is proposed. Para sa ngayon, wala pa kayong territory.</Notice>}

      {appts.map((a) => {
        const s = shownStatus(a);
        const mine = areas.filter((x) => x.appointment_id === a.id).map((x) => x.label);
        const revs = reviews.filter((r) => r.appointment_id === a.id);
        const subs = subPartners.filter((x) => x.parent_id === a.id);
        const canNominate = a.status === "active" && !a.parent_id && s.key !== "expired";
        return (
          <article key={a.id} className="card space-y-4 p-4 sm:p-5" aria-labelledby={`t-${a.id}`}>
            <header>
              <p className="text-xs font-bold uppercase text-muted">{RIGHTS[a.rights].label}{a.parent_id ? " · sub-partner" : ""}</p>
              <h2 id={`t-${a.id}`} className="break-words text-xl font-extrabold">{a.category_label}</h2>
              <p className="mt-1 flex flex-wrap gap-2 text-sm">
                <span className={`rounded-full px-2.5 py-0.5 font-bold ${tone(s.tone)}`}>{s.label}</span>
                <span className={`rounded-full px-2.5 py-0.5 font-bold ${a.exclusivity === "exclusive" ? "bg-flame text-white" : "bg-bg-soft"}`}>{EXCLUSIVITY[a.exclusivity].label}</span>
              </p>
              {a.status_reason && ["suspended", "ended"].includes(a.status) && <p className="mt-1 text-sm">Reason: {a.status_reason}</p>}
            </header>
            <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
              <Item k="Area" v={mine.join("; ")} />
              <Item k="Dates" v={`${day(a.start_date)} to ${day(a.end_date)}`} />
              <Item k="Exclusive?" v={<>{EXCLUSIVITY[a.exclusivity].help}<span className="block text-sm text-muted" lang="fil">{EXCLUSIVITY[a.exclusivity].fil}</span></>} />
              <Item k="Where you may sell" v={<ul className="list-disc pl-5">{a.channels.map((c) => <li key={c}>{CHANNELS[c as keyof typeof CHANNELS]?.label ?? c}</li>)}</ul>} />
              <Item k="Online orders" v={a.online_sales ? <>{ONLINE_SALES[a.online_sales].label}{a.online_note ? `. ${a.online_note}` : ""}<span className="block text-sm text-muted" lang="fil">{ONLINE_SALES[a.online_sales].fil}</span></> : null} />
              <Item k="Not covered (excluded accounts)" v={a.excluded_accounts.length ? a.excluded_accounts.join("; ") : "None"} />
              <Item k="Performance review" v={a.review_every ? `${REVIEW_EVERY[a.review_every].label}${a.next_review_date && ["active", "suspended"].includes(a.status) ? `; next on ${day(a.next_review_date)}` : ""}` : null} />
              {a.terms_note && <Item k="Note from the national team" v={a.terms_note} />}
            </dl>

            {(a.target_net_sales !== null || a.target_members !== null || a.target_note) && (
              <div className="space-y-2 rounded-xl bg-bg-soft p-3">
                <h3 className="font-bold">Targets</h3>
                <ul className="text-[15px]">
                  {a.target_net_sales !== null && <li>Net sales: <strong>{php(a.target_net_sales)}</strong> {a.target_period ? TARGET_PERIOD[a.target_period] : ""}</li>}
                  {a.target_members !== null && <li>Member businesses served: <strong>{a.target_members}</strong></li>}
                  {a.target_note && <li>{a.target_note}</li>}
                </ul>
                <p className="text-sm text-muted">{TARGET_NOTE.en}</p>
                <p className="text-sm text-muted" lang="fil">{TARGET_NOTE.tl}</p>
                <PartnerMoneyNotice compact />
              </div>
            )}

            {revs.length > 0 && (
              <div>
                <h3 className="font-bold">Performance reviews</h3>
                <ul className="mt-1 divide-y divide-line text-[15px]">
                  {revs.map((r) => (
                    <li key={r.id} className="py-2">
                      <p><strong>{day(r.period_start)} to {day(r.period_end)}</strong>: {RATINGS[r.rating]} · {OUTCOMES[r.outcome]}</p>
                      <p className="text-sm text-muted">Net sales {php(r.actual_net_sales)} · members served {r.actual_members ?? "—"}</p>
                      {r.note && <p className="whitespace-pre-line text-sm">{r.note}</p>}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {subs.length > 0 && (
              <div>
                <h3 className="font-bold">Sub-partners appointed under you</h3>
                <ul className="mt-1 space-y-1 text-[15px]">{subs.map((x) => <li key={x.id} className="break-words">{x.legal_name ?? "Partner"} · {x.areas ?? "—"} · {day(x.start_date)} to {day(x.end_date)} · {x.status}</li>)}</ul>
              </div>
            )}

            {canNominate && (
              <details id={`nominate-${a.id}`} className="scroll-mt-24 rounded-xl border border-line px-3 py-1" open={!!sp.error && sp.error !== "not_yours"}>
                <summary className="min-h-11 cursor-pointer content-center font-semibold">Nominate a sub-partner in this area</summary>
                <form action={nominateSubPartner} className="space-y-3 pb-3">
                  <input type="hidden" name="parent_id" value={a.id} />
                  <p className="text-sm text-muted">You suggest; the national team decides. The nominee must also become an accredited partner. <span lang="fil">Kayo ang magmumungkahi; ang national team ang magpapasya.</span></p>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="field"><label htmlFor={`nn-${a.id}`} className="label">Business name</label><input id={`nn-${a.id}`} name="nominee_name" required minLength={2} maxLength={200} className="input" /></div>
                    <div className="field"><label htmlFor={`nc-${a.id}`} className="label">Contact person</label><input id={`nc-${a.id}`} name="nominee_contact" required minLength={2} maxLength={120} autoComplete="off" className="input" /></div>
                    <div className="field"><label htmlFor={`np-${a.id}`} className="label">Mobile number</label><input id={`np-${a.id}`} name="nominee_phone" type="tel" inputMode="tel" maxLength={40} autoComplete="off" className="input" /></div>
                    <div className="field"><label htmlFor={`ne-${a.id}`} className="label">Email</label><input id={`ne-${a.id}`} name="nominee_email" type="email" maxLength={200} autoComplete="off" className="input" /><p className="field-help">A mobile number or an email is needed.</p></div>
                  </div>
                  <div className="field"><label htmlFor={`na-${a.id}`} className="label">Which part of your area?</label><input id={`na-${a.id}`} name="proposed_area" required minLength={2} maxLength={500} className="input" placeholder="e.g. Angeles City and Mabalacat City" /><p className="field-help">Inside your own area only: {mine.join("; ")}.</p></div>
                  <div className="field"><label htmlFor={`nr-${a.id}`} className="label">Why this business?</label><textarea id={`nr-${a.id}`} name="reason" required minLength={10} maxLength={1000} rows={3} className="input" placeholder="e.g. Already delivers to 40 member stores there; has a warehouse in Angeles." /></div>
                  <label className="flex min-h-11 cursor-pointer items-start gap-2"><input type="checkbox" name="nominee_agreed" value="yes" required className="check mt-0.5" /><span className="text-[15px]">The nominee agreed that I share their name and contact details with FLAME PH, so the national team can contact them. <span className="text-muted" lang="fil">Pumayag ang nominee na ibigay ko ang kanilang contact details.</span></span></label>
                  <SubmitButton className="btn btn-primary min-h-11 w-full sm:w-auto" pendingText="Sending…">Send nomination</SubmitButton>
                </form>
              </details>
            )}
          </article>
        );
      })}

      {nominations.length > 0 && (
        <section id="nominations" className="card scroll-mt-24 space-y-2 p-4 sm:p-5" aria-labelledby="noms-h">
          <h2 id="noms-h" className="text-lg font-bold">My sub-partner nominations</h2>
          <ul className="divide-y divide-line">
            {nominations.map((n) => (
              <li key={n.id} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <p className="break-words font-bold">{n.nominee_name}</p>
                  <p className="break-words text-sm text-muted">{n.proposed_area} · {label.get(n.parent_id) ?? ""}</p>
                  <span className={`mt-1 inline-block rounded-full px-2.5 py-0.5 text-sm font-bold ${tone(NOMINATION_STATUS[n.status].tone)}`}>{NOMINATION_STATUS[n.status].label}</span>
                  {n.decision_note && <p className="mt-1 text-sm">{n.decision_note}</p>}
                </div>
                {n.status === "submitted" && (
                  <form action={withdrawNomination}><input type="hidden" name="id" value={n.id} /><SubmitButton className="btn btn-outline min-h-11 w-full sm:w-auto" pendingText="Withdrawing…">Withdraw</SubmitButton></form>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
