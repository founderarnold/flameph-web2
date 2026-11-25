import { notFound } from "next/navigation";
import { Notice } from "@/components/ui";
import { adminContext } from "@/lib/admin/guard";
import { hoursLeft, memberNotice, nextSteps, npcDraft, type Incident } from "@/lib/breach";
import { PrivacyNav } from "@/components/admin/PrivacyNav";
import { OFFICIAL_LINKS } from "@/lib/site";
import { notifyMembers, updateIncident } from "../../actions";

export const metadata = { title: "Incident" };

const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString("en-PH", { timeZone: "Asia/Manila", dateStyle: "medium", timeStyle: "short" }) : "not yet");
const DONE: Record<string, string> = { started: "Incident started. The 72-hour clock is running.", details: "Saved.", contained: "Marked as contained.", npc: "NPC notice recorded.", close: "Incident closed. It stays in the log.", notified: "Members notified." };
const ERR: Record<string, string> = { confirm: "Tick the box to confirm.", codes: "Type at least one member code (FP-…).", failed: "That didn't go through. Please try again." };

/** Phase 12: one incident, its 72-hour clock, what is still owed, the NPC draft and the member notice. */
export default async function IncidentPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ done?: string; error?: string; n?: string; e?: string }> }) {
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const { db } = await adminContext(["super_admin", "admin"]);
  const { data } = await db.from("security_incidents").select("*").eq("id", id).maybeSingle();
  if (!data) notFound();
  const i = data as Incident;
  const h = hoursLeft(i);
  const steps = nextSteps(i);
  const notice = memberNotice(i);
  return (
    <div className="space-y-5">
      <h1 className="text-3xl font-extrabold text-primary">{i.title}</h1>
      <PrivacyNav here="incidents" />
      {sp.done && DONE[sp.done] && <div role="status"><Notice tone="ok">{DONE[sp.done]}{sp.done === "notified" ? ` ${sp.n ?? 0} members got the in-app notice; ${sp.e ?? 0} emails went out.` : ""}</Notice></div>}
      {sp.error && <div role="alert"><Notice tone="danger">{ERR[sp.error] ?? ERR.failed}</Notice></div>}

      <section className={`card space-y-2 border-2 p-4 ${i.status !== "closed" && h < 24 ? "border-danger" : "border-line"}`}>
        <p className="text-lg font-bold">{i.status === "closed" ? "Closed" : h >= 0 ? `${h} hours left of the 72` : `The 72 hours ended ${-h} hours ago`}</p>
        <p className="text-sm">Aware: {when(i.aware_at)} · Deadline: {when(i.deadline_at)} · Contained: {when(i.contained_at)} · NPC told: {when(i.npc_notified_at)}{i.npc_reference ? ` (ref ${i.npc_reference})` : ""} · Members told: {i.members_notified_at ? `${when(i.members_notified_at)}, ${i.members_notified_count ?? 0}` : "not yet"}</p>
        {steps.length > 0 && <><p className="font-semibold">Still to do</p><ol className="list-decimal space-y-1 pl-5 text-sm">{steps.map((st) => <li key={st}>{st}</li>)}</ol></>}
        <div className="flex flex-wrap gap-2">
          {!i.contained_at && <form action={updateIncident}><input type="hidden" name="incident_id" value={i.id} /><button name="step" value="contained" className="btn btn-outline min-h-11">Contained</button></form>}
          {i.status !== "closed" && <form action={updateIncident}><input type="hidden" name="incident_id" value={i.id} /><button name="step" value="close" className="btn btn-outline min-h-11">Close the incident</button></form>}
        </div>
      </section>

      <form action={updateIncident} className="card space-y-2 p-4">
        <h2 className="text-lg font-bold">Details</h2>
        <input type="hidden" name="incident_id" value={i.id} />
        <input type="hidden" name="step" value="details" />
        <label className="label" htmlFor="t">Title</label><input id="t" name="title" defaultValue={i.title} maxLength={200} className="input w-full" />
        <label className="label" htmlFor="sm">What happened</label><textarea id="sm" name="summary" defaultValue={i.summary ?? ""} rows={3} maxLength={4000} className="input w-full" />
        <label className="label" htmlFor="di">Personal data involved (for example: names and emails of members)</label><input id="di" name="data_involved" defaultValue={i.data_involved ?? ""} maxLength={1000} className="input w-full" />
        <div className="grid gap-2 sm:grid-cols-3">
          <div><label className="label" htmlFor="ac">Members affected (estimate)</label><input id="ac" name="affected_count" type="number" min={0} defaultValue={i.affected_count ?? ""} className="input w-full" /></div>
          <div><label className="label" htmlFor="sv">Severity</label><select id="sv" name="severity" defaultValue={i.severity} className="input w-full"><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option></select></div>
          <div><label className="label" htmlFor="rr">Real risk of serious harm?</label><select id="rr" name="real_risk" defaultValue={i.real_risk === null ? "" : i.real_risk ? "yes" : "no"} className="input w-full"><option value="">Not decided (treated as yes)</option><option value="yes">Yes: NPC and members must be told</option><option value="no">No: record it only</option></select></div>
        </div>
        <label className="label" htmlFor="ms">What we did about it</label><textarea id="ms" name="measures" defaultValue={i.measures ?? ""} rows={3} maxLength={4000} className="input w-full" />
        <label className="label" htmlFor="ma">What members should do</label><textarea id="ma" name="member_advice" defaultValue={i.member_advice ?? ""} rows={2} maxLength={2000} className="input w-full" />
        <button className="btn btn-primary min-h-11">Save</button>
      </form>

      <section className="card space-y-2 p-4">
        <h2 className="text-lg font-bold">1. Tell the National Privacy Commission</h2>
        <p className="text-sm">Use the NPC&apos;s online breach reporting system (start at the <a className="text-mph underline" href={OFFICIAL_LINKS.NPC} target="_blank" rel="noopener">NPC website</a>). Copy this draft, check every line, then record the date and reference below.</p>
        <pre className="max-h-80 overflow-auto whitespace-pre-wrap rounded-lg bg-bg-soft p-3 text-xs">{npcDraft(i)}</pre>
        <form action={updateIncident} className="grid gap-2 sm:grid-cols-3">
          <input type="hidden" name="incident_id" value={i.id} /><input type="hidden" name="step" value="npc" />
          <div><label className="label" htmlFor="na">When you sent it (Manila time; empty = now)</label><input id="na" name="npc_at" type="datetime-local" className="input w-full" /></div>
          <div><label className="label" htmlFor="nr">NPC reference</label><input id="nr" name="npc_reference" maxLength={200} className="input w-full" /></div>
          <button className="btn btn-outline min-h-11 self-end">Record the NPC notice</button>
        </form>
      </section>

      <section id="notify" className="card scroll-mt-24 space-y-2 p-4">
        <h2 className="text-lg font-bold">2. Tell the affected members</h2>
        <p className="text-sm">Each gets an in-app notice and this email. Fill in the details above first.</p>
        <pre className="max-h-80 overflow-auto whitespace-pre-wrap rounded-lg bg-bg-soft p-3 text-xs">{`Subject: ${notice.subject}\n\n${notice.text}`}</pre>
        <form action={notifyMembers} className="space-y-2">
          <input type="hidden" name="id" value={i.id} />
          <fieldset className="space-y-1"><legend className="label">Who</legend>
            <label className="flex min-h-11 items-center gap-2"><input type="radio" name="scope" value="codes" defaultChecked className="size-5" />These members (codes below)</label>
            <label className="flex min-h-11 items-center gap-2"><input type="radio" name="scope" value="all" className="size-5" />All members</label>
          </fieldset>
          <label className="label" htmlFor="cd">Member codes, separated by commas or new lines</label>
          <textarea id="cd" name="codes" rows={3} className="input w-full" placeholder="FP-1001, FP-1002" />
          <p className="text-xs text-muted">The free email plan sends about 100 a day. Above that, the rest still get the in-app notice; send the email again the next day, or upgrade the email plan.</p>
          <label className="flex min-h-11 items-start gap-2"><input type="checkbox" name="confirm" className="mt-1 size-5" /><span>I checked the text. Send it.</span></label>
          <button className="btn btn-danger min-h-11">Notify members</button>
        </form>
      </section>
    </div>
  );
}
