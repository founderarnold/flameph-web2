import Link from "next/link";
import { notFound } from "next/navigation";
import { adminContext } from "@/lib/admin/guard";
import { Notice } from "@/components/ui";
import { SubmitButton } from "@/components/SubmitButton";
import { PartnerTabs } from "@/components/admin/PartnerTabs";
import { AreaPicker } from "@/components/AreaPicker";
import { ROLE_LABELS } from "@/lib/moderation";
import { PRODUCT_GROUPS } from "@/lib/offers";
import { areaCodes, provinceCodeByName, regionCodeByLabel } from "@/lib/ph-geo";
import {
  AREA_LEVELS, CHANNEL_KEYS, CHANNELS, covers, EXCLUSIVITY, MAX_AREAS, ONLINE_SALES, OUTCOMES, PARTNER_KINDS, php, RATINGS, REVIEW_EVERY, reviewDue,
  RIGHTS, shownStatus, TARGET_NOTE, TARGET_PERIOD, type Exclusivity, type OnlineSales, type PartnerKind, type Rating, type Outcome, type ReviewEvery, type TargetPeriod,
} from "@/lib/territory";
import { addArea, addReview, approveAppointment, changeStatus, removeArea, renewAppointment, saveDates, saveTerms, setNextReview, teamNote } from "../actions";

export const metadata = { title: "Territory appointment", robots: { index: false } };

type Appt = {
  id: string; partner_user_id: string; parent_id: string | null; nomination_id: string | null; partner_category: PartnerKind; rights: keyof typeof RIGHTS; category_key: string; category_label: string;
  offer_id: string | null; exclusivity: Exclusivity; channels: string[]; online_sales: OnlineSales | null; online_note: string | null; excluded_accounts: string[];
  start_date: string | null; end_date: string | null; target_period: TargetPeriod | null; target_net_sales: number | null; target_members: number | null; target_note: string | null;
  review_every: ReviewEvery | null; next_review_date: string | null; terms_note: string | null; internal_note: string | null; overlap_approved: boolean; overlap_reason: string | null;
  overlap_with: string[]; status: string; created_by: string | null; approved_by: string | null; approved_at: string | null; changed_by: string | null; changed_at: string | null;
  status_reason: string | null; ended_at: string | null; created_at: string;
};
type Area = { id: string; level: keyof typeof AREA_LEVELS; code: string | null; label: string; region_code: string | null; province_code: string | null; city_code: string | null };
type Review = { id: string; reviewer_id: string | null; period_start: string; period_end: string; actual_net_sales: number | null; actual_members: number | null; rating: Rating; outcome: Outcome; note: string | null; internal_note: string | null; created_at: string };
type Hist = { id: string; actor_id: string | null; action: string; note: string | null; internal: boolean; created_at: string };
type Clash = { other_id: string; other_partner: string; other_status: string; other_exclusivity: string; area: string; other_area: string };

const when = (s: string | null) => (s ? new Date(s).toLocaleString("en-PH", { timeZone: "Asia/Manila", dateStyle: "medium", timeStyle: "short" }) : "—");
const day = (s: string | null) => (s ? new Date(`${s}T00:00:00+08:00`).toLocaleDateString("en-PH", { timeZone: "Asia/Manila", dateStyle: "medium" }) : "—");
const tone = (t: string) => ({ ok: "bg-ok-soft text-ok", warn: "bg-warn-soft text-warn", danger: "bg-danger-soft text-danger", info: "bg-primary-soft text-primary" })[t] ?? "bg-bg-soft";
const ERR: Record<string, string> = {
  own: "This is your own appointment. Another member of the national team must handle it.", locked: "Only a draft can be changed. To change an approved appointment, end it or start a renewal.",
  status: "That can't be done in the current status.", category: "Choose a product group, or type the category name (at least 2 letters).",
  date: "Use a real date.", date_order: "The end date must be after the start date.", date_long: "An appointment can last at most 10 years.", number: "Type numbers only (for example 1200000).",
  area: "Choose the area first.", area_twice: "That area is already on the list.", coi: "Tick the box to declare that you have no conflict of interest with this partner.",
  overlap: "This overlaps an exclusive appointment. Change the area, dates or channels, or tick \"Approve the overlap\" and write why.", overlap_reason: "Write why the overlap is approved.",
  reason: "Write the reason. The partner will read it.", confirm: "Tick the box to confirm that you are ending the appointment.", period: "Choose the review period (the end on or after the start).",
  rating: "Choose the rating and the outcome.", empty_note: "Write the note first.", failed: "That didn't go through. Please try again.",
};
const DONE: Record<string, string> = {
  created: "Draft started. Add the areas, channels, dates and targets, then approve.", renewal: "Renewal draft started from the earlier appointment. Check the dates, areas and targets, then approve.",
  terms: "Saved.", dates: "Saved.", area: "Area added.", area_removed: "Area removed.", approved: "Approved. The partner was told in their Inbox and by email.",
  suspended: "Suspended. The partner was told.", resumed: "Active again. The partner was told.", ended: "Ended. The partner was told; sub-partners under it ended too.", cancelled: "Draft cancelled.",
  reviewed: "Review saved. The partner was told.", note: "Note saved (team only).", next_review: "Next review date saved.",
};
const ACTION: Record<string, string> = { created: "Draft started", approved: "Approved", suspended: "Suspended", resumed: "Active again", ended: "Ended", cancelled: "Cancelled", reviewed: "Performance review", team_note: "Team note", renewal_started: "Renewal draft started" };
const radio = "flex min-h-11 cursor-pointer items-start gap-2 rounded-xl border border-line px-3 py-2 has-[:checked]:border-primary has-[:checked]:bg-primary-soft";

/** One appointment for the national team: a draft is filled in here and approved; an approved one is reviewed,
 *  suspended, ended or renewed. */
export default async function TerritoryPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ done?: string; error?: string; m?: string }> }) {
  const { id } = await params;
  const sp = await searchParams;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const ctx = await adminContext(["super_admin", "admin", "national_reviewer"]);
  const [{ data: row }, { data: areaRows }, { data: reviewRows }, { data: histRows }, { data: subs }] = await Promise.all([
    ctx.db.from("territorial_appointments").select("*").eq("id", id).maybeSingle(),
    ctx.db.from("territory_areas").select("id, level, code, label, region_code, province_code, city_code").eq("appointment_id", id).order("created_at"),
    ctx.db.from("territory_reviews").select("*").eq("appointment_id", id).order("period_end", { ascending: false }),
    ctx.db.from("territory_history").select("id, actor_id, action, note, internal, created_at").eq("appointment_id", id).order("created_at", { ascending: false }).limit(100),
    ctx.db.from("territorial_appointments").select("id, partner_user_id, status, exclusivity").eq("parent_id", id).limit(100),
  ]);
  if (!row) notFound();
  const a = row as unknown as Appt;
  const areas = (areaRows ?? []) as Area[];
  const reviews = (reviewRows ?? []) as Review[];
  const hist = (histRows ?? []) as Hist[];
  const draft = a.status === "draft";
  const own = a.partner_user_id === ctx.user.id;
  const { data: clashRows } = draft || a.status === "suspended" ? await ctx.db.rpc("territory_conflicts", { p_id: id }) : { data: [] };
  const clashes = (clashRows ?? []) as Clash[];
  const people = [...new Set([a.partner_user_id, a.approved_by, a.changed_by, a.created_by, ...reviews.map((r) => r.reviewer_id), ...hist.map((h) => h.actor_id), ...clashes.map((c) => c.other_partner), ...(subs ?? []).map((s) => s.partner_user_id)].filter(Boolean) as string[])];
  const [{ data: names }, { data: partnerNames }, { data: roleRows }, { data: parent }, { data: offers }, { data: chapters }] = await Promise.all([
    ctx.db.from("profiles").select("id, full_name").in("id", people),
    ctx.db.from("partner_profiles").select("user_id, legal_name, status, categories").in("user_id", people),
    ctx.db.from("roles").select("user_id, role").in("user_id", people),
    a.parent_id ? ctx.db.from("territorial_appointments").select("id, partner_user_id, category_label, start_date, end_date, exclusivity, channels").eq("id", a.parent_id).maybeSingle() : Promise.resolve({ data: null }),
    ctx.db.from("supplier_offers").select("id, title, status").eq("user_id", a.partner_user_id).in("status", ["selected", "submitted"]).limit(50),
    ctx.db.from("chapters").select("id, name, province, region, status").limit(500),
  ]);
  const legal = new Map((partnerNames ?? []).map((p) => [p.user_id, p.legal_name as string]));
  const nameOf = new Map((names ?? []).map((p) => [p.id, p.full_name as string]));
  const roleOf = new Map((roleRows ?? []).map((r) => [r.user_id, ROLE_LABELS[r.role] ?? r.role]));
  const who = (uid: string | null) => (uid ? `${nameOf.get(uid) ?? "Team member"}${roleOf.get(uid) ? ` (${roleOf.get(uid)})` : ""}` : "Erased account");
  const partnerProfile = (partnerNames ?? []).find((p) => p.user_id === a.partner_user_id);
  const shown = shownStatus(a);
  // Chapters inside this territory (reuses the chapters list and its province or region).
  const inside = ((chapters ?? []) as { id: string; name: string; province: string | null; region: string | null; status: string }[]).filter((c) => {
    const pc = provinceCodeByName(c.province); const rc = regionCodeByLabel(c.region);
    const codes = pc ? areaCodes("province", pc) : rc ? areaCodes("region", rc) : null;
    return !!codes && areas.some((x) => covers(x, codes));
  });
  const err = sp.error === "db" ? sp.m ?? ERR.failed : sp.error ? ERR[sp.error] ?? ERR.failed : null;
  const group = a.category_key in PRODUCT_GROUPS ? a.category_key : "";
  const Item = ({ k, v }: { k: string; v?: React.ReactNode }) => <div className="min-w-0"><dt className="text-xs font-bold uppercase text-muted">{k}</dt><dd className="break-words">{v || <span className="text-muted">—</span>}</dd></div>;

  return (
    <div className="space-y-4">
      <PartnerTabs current="territories" />
      <nav aria-label="Breadcrumb" className="text-sm text-muted"><Link href="/admin/partners/territories" className="underline">Territories</Link> › {legal.get(a.partner_user_id) ?? "Appointment"}</nav>
      <header>
        <p className="text-xs font-bold uppercase text-muted">{PARTNER_KINDS[a.partner_category]} · {RIGHTS[a.rights].label}{a.parent_id ? " · sub-partner" : ""}</p>
        <h1 className="break-words text-2xl font-extrabold text-primary">{legal.get(a.partner_user_id) ?? "—"}</h1>
        <p className="break-words text-[15px]">{a.category_label}</p>
        <p className="mt-1 flex flex-wrap gap-2 text-sm">
          <span className={`rounded-full px-2.5 py-0.5 font-bold ${tone(shown.tone)}`}>{shown.label}</span>
          <span className={`rounded-full px-2.5 py-0.5 font-bold ${a.exclusivity === "exclusive" ? "bg-flame text-white" : "bg-bg-soft"}`}>{EXCLUSIVITY[a.exclusivity].label}</span>
          {partnerProfile && partnerProfile.status !== "accredited" && <span className="rounded-full bg-danger-soft px-2.5 py-0.5 font-bold text-danger">Partner not accredited now</span>}
        </p>
        {a.status_reason && !draft && <p className="mt-1 text-sm">Reason: {a.status_reason}</p>}
        {parent && <p className="mt-1 text-sm">Main appointment: <Link href={`/admin/partners/territories/${parent.id}`} className="underline">{legal.get(parent.partner_user_id) ?? "main partner"} · {parent.category_label}</Link> ({day(parent.start_date)} to {day(parent.end_date)}, {EXCLUSIVITY[parent.exclusivity as Exclusivity].label.toLowerCase()})</p>}
      </header>
      {sp.done && <div role="status"><Notice tone="ok">{DONE[sp.done] ?? "Saved."}</Notice></div>}
      {err && <div role="alert"><Notice tone="danger">{err}</Notice></div>}
      {own && <Notice tone="warn">{ERR.own}</Notice>}
      {draft && <Notice tone="info">Draft: only the national team sees it. The partner sees it after approval.</Notice>}

      {/* ---------------- Areas ---------------- */}
      <section id="areas" className="card scroll-mt-24 space-y-3 p-4" aria-labelledby="areas-h">
        <h2 id="areas-h" className="text-lg font-bold">Where: areas ({areas.length})</h2>
        {areas.length === 0 ? <p className="text-sm text-muted">No area yet. Add at least one.</p> : (
          <ul className="divide-y divide-line">
            {areas.map((x) => (
              <li key={x.id} className="flex flex-col gap-2 py-2 sm:flex-row sm:items-center sm:justify-between">
                <span className="min-w-0"><span className="block break-words font-semibold">{x.label}</span><span className="block text-xs text-muted">{AREA_LEVELS[x.level]}{x.code ? ` · PSGC ${x.code}` : ""}</span></span>
                {draft && !own && (
                  <form action={removeArea}><input type="hidden" name="id" value={id} /><input type="hidden" name="area_id" value={x.id} /><SubmitButton className="btn btn-outline min-h-11 px-3 text-sm" pendingText="Removing…">Remove</SubmitButton></form>
                )}
              </li>
            ))}
          </ul>
        )}
        {inside.length > 0 && <p className="text-sm text-muted">Chapters inside: {inside.map((c) => `${c.name} (${c.status})`).join(", ")}.</p>}
        {draft && !own && areas.length < MAX_AREAS && (
          <form action={addArea} className="space-y-2 border-t border-line pt-3">
            <input type="hidden" name="id" value={id} />
            <AreaPicker />
          </form>
        )}
        {a.parent_id && draft && <p className="text-xs text-muted">A sub-partner&apos;s areas must be inside the main appointment&apos;s areas.</p>}
      </section>

      {/* ---------------- Terms ---------------- */}
      <section id="terms" className="card scroll-mt-24 space-y-3 p-4" aria-labelledby="terms-h">
        <h2 id="terms-h" className="text-lg font-bold">What and how</h2>
        {draft && !own ? (
          <form action={saveTerms} className="space-y-4">
            <input type="hidden" name="id" value={id} />
            {!a.parent_id && <>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="field">
                  <label htmlFor="group" className="label">Product group</label>
                  <select id="group" name="group" className="input" defaultValue={group}>
                    <option value="">Use the category name instead</option>
                    {Object.entries(PRODUCT_GROUPS).filter(([k]) => k !== "other").map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                </div>
                <div className="field">
                  <label htmlFor="category_name" className="label">Category name (services and other products)</label>
                  <input id="category_name" name="category_name" maxLength={150} defaultValue={group ? "" : a.category_label} className="input" />
                </div>
              </div>
              {a.partner_category === "toll_manufacturer" && (
                <fieldset><legend className="label">Rights</legend>
                  <div className="grid gap-2 sm:grid-cols-2">{(Object.keys(RIGHTS) as (keyof typeof RIGHTS)[]).map((k) => <label key={k} className={radio}><input type="radio" name="rights" value={k} defaultChecked={a.rights === k} className="check mt-1" /><span><span className="block font-semibold">{RIGHTS[k].label}</span><span className="block text-sm text-muted">{RIGHTS[k].help}</span></span></label>)}</div>
                </fieldset>
              )}
            </>}
            {a.parent_id && <p className="text-sm text-muted">Category and rights come from the main appointment: {a.category_label} ({RIGHTS[a.rights].label.toLowerCase()}).</p>}
            <fieldset><legend className="label">Exclusive or not?</legend>
              <div className="grid gap-2 sm:grid-cols-2">{(Object.keys(EXCLUSIVITY) as Exclusivity[]).map((k) => <label key={k} className={radio}><input type="radio" name="exclusivity" value={k} defaultChecked={a.exclusivity === k} className="check mt-1" /><span><span className="block font-semibold">{EXCLUSIVITY[k].label}</span><span className="block text-sm text-muted">{EXCLUSIVITY[k].help}</span></span></label>)}</div>
            </fieldset>
            <fieldset><legend className="label">Permitted selling channels</legend>
              <div className="grid gap-1 sm:grid-cols-2">{CHANNEL_KEYS.map((k) => <label key={k} className="flex min-h-11 cursor-pointer items-start gap-2 py-1"><input type="checkbox" name="channels" value={k} defaultChecked={a.channels.includes(k)} className="check mt-0.5" /><span className="text-[15px]">{CHANNELS[k].label}</span></label>)}</div>
              <p className="field-help">Overlaps are checked per channel: two partners on different channels do not clash.</p>
            </fieldset>
            <fieldset><legend className="label">Online sales</legend>
              <div className="grid gap-2">{(Object.keys(ONLINE_SALES) as OnlineSales[]).map((k) => <label key={k} className={radio}><input type="radio" name="online_sales" value={k} defaultChecked={a.online_sales === k} className="check mt-1" /><span className="text-[15px]">{ONLINE_SALES[k].label}</span></label>)}</div>
            </fieldset>
            <div className="field"><label htmlFor="online_note" className="label">Online sales note (optional)</label><input id="online_note" name="online_note" maxLength={500} defaultValue={a.online_note ?? ""} className="input" placeholder="e.g. Orders from the partner's own Facebook page count when delivered inside the area." /></div>
            <div className="field">
              <label htmlFor="excluded" className="label">Excluded accounts (one per line, optional)</label>
              <textarea id="excluded" name="excluded" rows={3} maxLength={5000} defaultValue={a.excluded_accounts.join("\n")} className="input" placeholder={"e.g. SM Supermarkets\nGovernment agencies (handled nationally)"} />
              <p className="field-help">Buyers this appointment does not cover, even inside the area. Up to 30.</p>
            </div>
            {(offers ?? []).length > 0 && (
              <div className="field"><label htmlFor="offer_id" className="label">Best Offer behind it (optional)</label>
                <select id="offer_id" name="offer_id" className="input" defaultValue={a.offer_id ?? ""}><option value="">None</option>{(offers ?? []).map((o) => <option key={o.id} value={o.id}>{o.title ?? "(no name)"} ({o.status === "selected" ? "Best Offer" : "waiting for review"})</option>)}</select>
              </div>
            )}
            <SubmitButton className="btn btn-primary min-h-11 w-full sm:w-auto" pendingText="Saving…">Save</SubmitButton>
          </form>
        ) : (
          <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
            <Item k="Exclusive" v={`${EXCLUSIVITY[a.exclusivity].label}${a.overlap_approved ? " (an overlap was approved)" : ""}`} />
            <Item k="Selling channels" v={a.channels.map((c) => CHANNELS[c as keyof typeof CHANNELS]?.label ?? c).join("; ")} />
            <Item k="Online sales" v={a.online_sales ? `${ONLINE_SALES[a.online_sales].label}${a.online_note ? `. ${a.online_note}` : ""}` : null} />
            <Item k="Excluded accounts" v={a.excluded_accounts.join("; ") || "None"} />
            {a.overlap_reason && <Item k="Why the overlap was approved (team only)" v={a.overlap_reason} />}
          </dl>
        )}
      </section>

      {/* ---------------- Dates and targets ---------------- */}
      <section id="dates" className="card scroll-mt-24 space-y-3 p-4" aria-labelledby="dates-h">
        <h2 id="dates-h" className="text-lg font-bold">When, targets and reviews</h2>
        <p className="text-sm text-muted">{TARGET_NOTE.en}</p>
        {draft && !own ? (
          <form action={saveDates} className="space-y-4">
            <input type="hidden" name="id" value={id} />
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="field"><label htmlFor="start_date" className="label">Start date</label><input id="start_date" name="start_date" type="date" defaultValue={a.start_date ?? ""} className="input" /></div>
              <div className="field"><label htmlFor="end_date" className="label">End date</label><input id="end_date" name="end_date" type="date" defaultValue={a.end_date ?? ""} className="input" /></div>
              <div className="field"><label htmlFor="target_net_sales" className="label">Net sales target (₱)</label><input id="target_net_sales" name="target_net_sales" inputMode="decimal" defaultValue={a.target_net_sales ?? ""} className="input" placeholder="e.g. 1200000" /></div>
              <div className="field"><label htmlFor="target_period" className="label">Target is</label><select id="target_period" name="target_period" defaultValue={a.target_period ?? "yearly"} className="input">{(Object.keys(TARGET_PERIOD) as TargetPeriod[]).map((k) => <option key={k} value={k}>{TARGET_PERIOD[k]}</option>)}</select></div>
              <div className="field"><label htmlFor="target_members" className="label">Member businesses served (target)</label><input id="target_members" name="target_members" inputMode="numeric" defaultValue={a.target_members ?? ""} className="input" placeholder="e.g. 50" /></div>
              <div className="field"><label htmlFor="review_every" className="label">Performance review</label><select id="review_every" name="review_every" defaultValue={a.review_every ?? "quarterly"} className="input">{(Object.keys(REVIEW_EVERY) as ReviewEvery[]).map((k) => <option key={k} value={k}>{REVIEW_EVERY[k].label}</option>)}</select></div>
              <div className="field"><label htmlFor="next_review_date" className="label">First review date (optional)</label><input id="next_review_date" name="next_review_date" type="date" defaultValue={a.next_review_date ?? ""} className="input" /><p className="field-help">Empty: start date plus the review period.</p></div>
            </div>
            <div className="field"><label htmlFor="target_note" className="label">Other targets (optional)</label><textarea id="target_note" name="target_note" rows={2} maxLength={1000} defaultValue={a.target_note ?? ""} className="input" placeholder="e.g. 2 chapter product demos per quarter; delivery within 3 days." /></div>
            <div className="field"><label htmlFor="terms_note" className="label">Note to the partner (shown on their My territories page)</label><textarea id="terms_note" name="terms_note" rows={2} maxLength={2000} defaultValue={a.terms_note ?? ""} className="input" /></div>
            <div className="field"><label htmlFor="internal_note" className="label">Team note (the partner never sees it)</label><textarea id="internal_note" name="internal_note" rows={2} maxLength={2000} defaultValue={a.internal_note ?? ""} className="input" /></div>
            <SubmitButton className="btn btn-primary min-h-11 w-full sm:w-auto" pendingText="Saving…">Save</SubmitButton>
          </form>
        ) : (
          <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
            <Item k="Dates" v={`${day(a.start_date)} to ${day(a.end_date)}`} />
            <Item k="Net sales target" v={a.target_net_sales !== null ? `${php(a.target_net_sales)} ${a.target_period ? TARGET_PERIOD[a.target_period] : ""}` : null} />
            <Item k="Member businesses served (target)" v={a.target_members !== null ? String(a.target_members) : null} />
            <Item k="Other targets" v={a.target_note} />
            <Item k="Performance review" v={a.review_every ? `${REVIEW_EVERY[a.review_every].label}; next ${day(a.next_review_date)}${reviewDue(a) ? " (due)" : ""}` : null} />
            <Item k="Note to the partner" v={a.terms_note} />
            <Item k="Team note" v={a.internal_note} />
            <Item k="Approved" v={a.approved_at ? `${when(a.approved_at)} by ${who(a.approved_by)}` : null} />
          </dl>
        )}
      </section>

      {/* ---------------- Overlap check and approval ---------------- */}
      {draft && !own && (
        <section id="approve" className="card scroll-mt-24 space-y-3 border-2 border-primary p-4" aria-labelledby="ap-h">
          <h2 id="ap-h" className="text-lg font-bold">Overlap check and approval</h2>
          {clashes.length === 0 ? (
            <Notice tone="ok">No overlap with another partner&apos;s exclusive appointment (same category, channels and dates){a.channels.length === 0 ? ". Choose the channels first: the check is per channel" : ""}.</Notice>
          ) : (
            <div className="space-y-2">
              <Notice tone="danger">Overlaps {new Set(clashes.map((c) => c.other_id)).size} live appointment(s) where at least one is exclusive:</Notice>
              <ul className="space-y-1 text-sm">
                {clashes.map((c, i) => <li key={i} className="break-words">• <Link href={`/admin/partners/territories/${c.other_id}`} className="font-semibold underline">{legal.get(c.other_partner) ?? "Another partner"}</Link> ({c.other_exclusivity === "exclusive" ? "exclusive" : "non-exclusive"}, {c.other_status}): {c.area} overlaps {c.other_area}</li>)}
              </ul>
            </div>
          )}
          <form action={approveAppointment} className="space-y-3">
            <input type="hidden" name="id" value={id} />
            {clashes.length > 0 && (
              <fieldset className="space-y-2 rounded-xl border-2 border-warn p-3">
                <legend className="px-1 font-bold">Approve the overlap anyway?</legend>
                <label className="flex min-h-11 cursor-pointer items-start gap-2"><input type="checkbox" name="overlap_ok" value="yes" className="check mt-0.5" /><span className="text-[15px]">Yes, the national team approves this overlap.</span></label>
                <label htmlFor="overlap_reason" className="label text-sm">Why (kept in the record; the partners do not see it)</label>
                <textarea id="overlap_reason" name="overlap_reason" rows={2} maxLength={1000} className="input" placeholder="e.g. The exclusive partner agreed in writing (meeting of 20 Nov) to share Angeles City for Group Orders only." />
              </fieldset>
            )}
            <label className="flex min-h-11 cursor-pointer items-start gap-2"><input type="checkbox" name="no_conflict" value="yes" required className="check mt-0.5" /><span className="text-[15px]">I declare that I, my family and my own business have no interest in this partner or a competing one.</span></label>
            <SubmitButton className="btn btn-primary min-h-11 w-full sm:w-auto" pendingText="Approving…">Approve appointment</SubmitButton>
            <p className="text-xs text-muted">The database runs the overlap check again and refuses an incomplete appointment (areas, channels, online rule, dates, review schedule).</p>
          </form>
          <details className="rounded-xl border border-line px-3 py-1">
            <summary className="min-h-11 cursor-pointer content-center text-sm font-semibold">Cancel this draft…</summary>
            <form action={changeStatus} className="space-y-2 pb-3">
              <input type="hidden" name="id" value={id} /><input type="hidden" name="move" value="cancel" />
              <label htmlFor="cancel-reason" className="label text-sm">Why (team only)</label>
              <textarea id="cancel-reason" name="reason" required maxLength={1000} rows={2} className="input" />
              <SubmitButton className="btn btn-outline min-h-11" pendingText="Cancelling…">Cancel draft</SubmitButton>
            </form>
          </details>
        </section>
      )}

      {/* ---------------- Status changes ---------------- */}
      {!draft && !own && a.status !== "cancelled" && (
        <section id="status" className="card scroll-mt-24 space-y-3 p-4" aria-labelledby="st-h">
          <h2 id="st-h" className="text-lg font-bold">Suspend, end or renew</h2>
          {a.status === "suspended" && clashes.length > 0 && <Notice tone="warn">Another appointment now overlaps this one; resuming will be refused unless an overlap was approved.</Notice>}
          <div className="grid gap-3 lg:grid-cols-2">
            {a.status === "active" && (
              <form action={changeStatus} className="space-y-2 rounded-xl border border-line p-3">
                <input type="hidden" name="id" value={id} /><input type="hidden" name="move" value="suspend" />
                <label htmlFor="sus-reason" className="label text-sm">Suspend: reason (the partner reads it)</label>
                <textarea id="sus-reason" name="reason" required maxLength={1000} rows={2} className="input" placeholder="e.g. Three late deliveries in October; on hold while we check." />
                <SubmitButton className="btn btn-outline min-h-11 w-full sm:w-auto" pendingText="Saving…">Suspend</SubmitButton>
              </form>
            )}
            {a.status === "suspended" && (
              <form action={changeStatus} className="space-y-2 rounded-xl border border-line p-3">
                <input type="hidden" name="id" value={id} /><input type="hidden" name="move" value="resume" />
                <label htmlFor="res-reason" className="label text-sm">Make active again: note (optional)</label>
                <textarea id="res-reason" name="reason" maxLength={1000} rows={2} className="input" />
                <SubmitButton className="btn btn-primary min-h-11 w-full sm:w-auto" pendingText="Saving…">Make active again</SubmitButton>
              </form>
            )}
            {["active", "suspended"].includes(a.status) && (
              <form action={changeStatus} className="space-y-2 rounded-xl border-2 border-danger p-3">
                <input type="hidden" name="id" value={id} /><input type="hidden" name="move" value="end" />
                <label htmlFor="end-reason" className="label text-sm">End: reason (the partner reads it)</label>
                <textarea id="end-reason" name="reason" required maxLength={1000} rows={2} className="input" />
                <label className="flex min-h-11 cursor-pointer items-start gap-2"><input type="checkbox" name="confirm" value="yes" required className="check mt-0.5" /><span className="text-sm">I understand this cannot be undone, and sub-partners under it end too.</span></label>
                <SubmitButton className="btn btn-outline min-h-11 w-full border-danger text-danger sm:w-auto" pendingText="Ending…">End appointment</SubmitButton>
              </form>
            )}
          </div>
          <form action={renewAppointment} className="border-t border-line pt-3">
            <input type="hidden" name="id" value={id} />
            <p className="mb-2 text-sm text-muted">Renewal or changes: start a new draft copied from this one (same areas, terms and targets; new dates). This one stays as it is until it ends.</p>
            <SubmitButton className="btn btn-outline min-h-11 w-full sm:w-auto" pendingText="Copying…">Start a renewal draft</SubmitButton>
          </form>
          {a.status === "active" && !a.parent_id && <Link href={`/admin/partners/territories/new?parent=${id}`} className="btn btn-outline min-h-11 w-full sm:w-auto">Appoint a sub-partner under this one</Link>}
        </section>
      )}

      {(subs ?? []).length > 0 && (
        <section className="card p-4" aria-labelledby="subs-h">
          <h2 id="subs-h" className="text-lg font-bold">Sub-partners under this appointment</h2>
          <ul className="mt-2 space-y-1 text-[15px]">{(subs ?? []).map((s) => <li key={s.id}><Link href={`/admin/partners/territories/${s.id}`} className="underline">{legal.get(s.partner_user_id) ?? "Partner"}</Link> · {s.status} · {s.exclusivity === "exclusive" ? "exclusive" : "non-exclusive"}</li>)}</ul>
        </section>
      )}

      {/* ---------------- Performance reviews ---------------- */}
      {!draft && a.status !== "cancelled" && (
        <section id="reviews" className="card scroll-mt-24 space-y-3 p-4" aria-labelledby="rev-h">
          <h2 id="rev-h" className="text-lg font-bold">Performance reviews ({reviews.length})</h2>
          <p className="text-sm text-muted">Figures are as reported and checked by the team. {TARGET_NOTE.en}</p>
          {reviews.length > 0 && (
            <ul className="divide-y divide-line text-[15px]">
              {reviews.map((r) => (
                <li key={r.id} className="py-2">
                  <p><strong>{day(r.period_start)} to {day(r.period_end)}</strong>: {RATINGS[r.rating]} · {OUTCOMES[r.outcome]}</p>
                  <p className="text-sm text-muted">Net sales {php(r.actual_net_sales)} · members served {r.actual_members ?? "—"} · by {who(r.reviewer_id)} on {when(r.created_at)}</p>
                  {r.note && <p className="whitespace-pre-line text-sm">To the partner: {r.note}</p>}
                  {r.internal_note && <p className="whitespace-pre-line text-sm text-muted">Team only: {r.internal_note}</p>}
                </li>
              ))}
            </ul>
          )}
          {!own && (
            <>
              <form action={addReview} className="space-y-3 border-t border-line pt-3">
                <input type="hidden" name="id" value={id} />
                <h3 className="font-bold">Add a review</h3>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="field"><label htmlFor="period_start" className="label">Period from</label><input id="period_start" name="period_start" type="date" required className="input" /></div>
                  <div className="field"><label htmlFor="period_end" className="label">Period to</label><input id="period_end" name="period_end" type="date" required className="input" /></div>
                  <div className="field"><label htmlFor="actual_net_sales" className="label">Net sales in the period (₱)</label><input id="actual_net_sales" name="actual_net_sales" inputMode="decimal" className="input" /></div>
                  <div className="field"><label htmlFor="actual_members" className="label">Member businesses served</label><input id="actual_members" name="actual_members" inputMode="numeric" className="input" /></div>
                  <div className="field"><label htmlFor="rating" className="label">Rating</label><select id="rating" name="rating" required defaultValue="" className="input"><option value="" disabled>Choose</option>{(Object.keys(RATINGS) as Rating[]).map((k) => <option key={k} value={k}>{RATINGS[k]}</option>)}</select></div>
                  <div className="field"><label htmlFor="outcome" className="label">Outcome</label><select id="outcome" name="outcome" required defaultValue="" className="input"><option value="" disabled>Choose</option>{(Object.keys(OUTCOMES) as Outcome[]).map((k) => <option key={k} value={k}>{OUTCOMES[k]}</option>)}</select></div>
                </div>
                <div className="field"><label htmlFor="rnote" className="label">Note to the partner</label><textarea id="rnote" name="note" rows={2} maxLength={2000} className="input" /></div>
                <div className="field"><label htmlFor="rinote" className="label">Team note (the partner never sees it)</label><textarea id="rinote" name="internal_note" rows={2} maxLength={2000} className="input" /></div>
                <p className="text-xs text-muted">A review never changes the appointment by itself. To make it smaller or non-exclusive, start a renewal draft; to end it, use End above.</p>
                <SubmitButton className="btn btn-primary min-h-11 w-full sm:w-auto" pendingText="Saving…">Save review</SubmitButton>
              </form>
              {["active", "suspended"].includes(a.status) && (
                <form action={setNextReview} className="flex flex-col gap-2 border-t border-line pt-3 sm:flex-row sm:items-end">
                  <input type="hidden" name="id" value={id} />
                  <div className="field sm:w-64"><label htmlFor="nrd" className="label text-sm">Next review date</label><input id="nrd" name="next_review_date" type="date" required defaultValue={a.next_review_date ?? ""} className="input" /></div>
                  <SubmitButton className="btn btn-outline min-h-11" pendingText="Saving…">Change date</SubmitButton>
                </form>
              )}
            </>
          )}
        </section>
      )}

      {/* ---------------- History ---------------- */}
      <section id="history" className="card scroll-mt-24 space-y-3 p-4" aria-labelledby="hist-h">
        <h2 id="hist-h" className="text-lg font-bold">History</h2>
        {hist.length === 0 ? <p className="text-sm text-muted">Nothing yet.</p> : (
          <ol className="space-y-2 text-sm">
            {hist.map((h) => (
              <li key={h.id} className="border-l-2 border-line pl-3">
                <span className="font-semibold">{ACTION[h.action] ?? h.action}</span>{h.internal && <span className="ml-1 rounded bg-bg-soft px-1 text-xs">team only</span>}
                <span className="text-muted"> · {when(h.created_at)} · {who(h.actor_id)}</span>
                {h.note && <span className="block whitespace-pre-line">{h.note}</span>}
              </li>
            ))}
          </ol>
        )}
        {!own && (
          <form action={teamNote} className="space-y-2 border-t border-line pt-3">
            <input type="hidden" name="id" value={id} />
            <label htmlFor="tnote" className="label text-sm">Add a note for the national team (the partner never sees it)</label>
            <textarea id="tnote" name="note" required maxLength={2000} rows={2} className="input" />
            <SubmitButton className="btn btn-outline min-h-11 w-full sm:w-auto" pendingText="Saving…">Save note</SubmitButton>
          </form>
        )}
      </section>
    </div>
  );
}
