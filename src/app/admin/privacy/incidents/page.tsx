import Link from "next/link";
import { Notice } from "@/components/ui";
import { adminContext } from "@/lib/admin/guard";
import { hoursLeft, type Incident } from "@/lib/breach";
import { day } from "@/lib/data-rights";
import { PrivacyNav } from "@/components/admin/PrivacyNav";
import { startIncident } from "../actions";

export const metadata = { title: "Breaches" };

const ERR: Record<string, string> = { title: "Give it a short title.", date: "Check the date and time you became aware (it can't be in the future).", failed: "That didn't go through. Please try again." };

/**
 * Phase 12: the incident log (Legal Pack, Part F). Every possible breach is recorded here, reported or not. The
 * 72-hour clock for telling the NPC and the affected members runs from when FLAME PH became aware.
 */
export default async function Incidents({ searchParams }: { searchParams: Promise<{ error?: string; signal?: string; title?: string }> }) {
  const sp = await searchParams;
  const { db } = await adminContext(["super_admin", "admin"]);
  const { data, error } = await db.from("security_incidents").select("*").order("aware_at", { ascending: false }).limit(100);
  const rows = (data ?? []) as Incident[];
  return (
    <div className="space-y-5">
      <h1 className="text-3xl font-extrabold text-primary">Privacy and security</h1>
      <PrivacyNav here="incidents" />
      {sp.error && <div role="alert"><Notice tone="danger">{ERR[sp.error] ?? ERR.failed}</Notice></div>}
      {error && <Notice tone="info">This opens after FLAME PH finishes a database update (0028).</Notice>}
      <div className="rounded-xl bg-warn-soft p-3 text-sm">
        <p className="font-semibold">Think personal data may have leaked, been changed or been lost?</p>
        <p className="mt-1">Start an incident now. The clock starts when FLAME PH knew. If there is a real risk of serious harm, the National Privacy Commission and the affected members must be told within 72 hours. Contain it first: revoke keys, close access.</p>
      </div>

      <form action={startIncident} className="card space-y-2 p-4">
        <h2 className="text-lg font-bold">Start an incident</h2>
        {sp.signal && <input type="hidden" name="signal_id" value={sp.signal} />}
        <label className="label" htmlFor="it">What happened, in a few words</label>
        <input id="it" name="title" required maxLength={200} defaultValue={sp.title ?? ""} className="input w-full" />
        <label className="label" htmlFor="is">More detail (optional)</label>
        <textarea id="is" name="summary" rows={3} maxLength={4000} className="input w-full" />
        <label className="label" htmlFor="ia">When FLAME PH became aware (Manila time). Leave empty for now.</label>
        <input id="ia" name="aware_at" type="datetime-local" className="input w-full sm:w-auto" />
        <button className="btn btn-danger min-h-11">Start the incident and the 72-hour clock</button>
      </form>

      <h2 className="text-lg font-bold">Incident log ({rows.length})</h2>
      {rows.length === 0 ? <p className="card p-5 text-muted">No incidents recorded.</p> : (
        <ul className="space-y-2">
          {rows.map((i) => {
            const h = hoursLeft(i);
            const owed = i.real_risk !== false && (!i.npc_notified_at || !i.members_notified_at) && i.status !== "closed";
            return (
              <li key={i.id} className="card p-4">
                <Link href={`/admin/privacy/incidents/${i.id}`} className="font-bold text-mph underline">{i.title}</Link>
                <p className="text-sm text-muted">Aware {day(i.aware_at)} · {i.status}{owed ? (h >= 0 ? ` · ${h} hours left to notify` : ` · notice deadline passed ${-h} hours ago`) : ""}</p>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
