// Phase 12: personal data breach handling (Privacy Notice, section 7; Legal Pack, Part F; NPC Circular 16-03).
// The 72 hours run from when FLAME PH became aware of the breach. If there is a real risk of serious harm, the NPC and
// the affected members are told within those 72 hours. These build the texts the DPO reviews before anything is sent.

import { ORG } from "@/lib/site";

export type Incident = {
  id: string; title: string; summary: string | null; aware_at: string; deadline_at: string | null; severity: "low" | "medium" | "high";
  data_involved: string | null; affected_count: number | null; real_risk: boolean | null; measures: string | null; member_advice: string | null;
  contained_at: string | null; npc_notified_at: string | null; npc_reference: string | null; members_notified_at: string | null;
  members_notified_count: number | null; status: "open" | "contained" | "closed"; created_at: string; closed_at: string | null;
};

export const NOTICE_HOURS = 72;

export const deadlineOf = (i: Pick<Incident, "aware_at" | "deadline_at">) => new Date(i.deadline_at ?? new Date(new Date(i.aware_at).getTime() + NOTICE_HOURS * 3600_000).toISOString());

/** Whole hours left until the 72-hour deadline (negative when it has passed). */
export function hoursLeft(i: Pick<Incident, "aware_at" | "deadline_at">, now = new Date()): number {
  return Math.floor((deadlineOf(i).getTime() - now.getTime()) / 3600_000);
}

/** What still has to happen for this incident, in order (empty when nothing is owed). */
export function nextSteps(i: Incident): string[] {
  const steps: string[] = [];
  if (!i.contained_at) steps.push("Contain it: revoke keys, close access, stop the leak. Then press \"Contained\".");
  if (i.real_risk === null) steps.push("Decide: is there a real risk of serious harm to members? (If unsure, treat it as yes.)");
  if (i.real_risk !== false && !i.npc_notified_at) steps.push("Notify the NPC through its online breach reporting system, then record the date and reference here.");
  if (i.real_risk !== false && !i.members_notified_at) steps.push("Notify the affected members (button below).");
  if (!i.closed_at && steps.length === 0) steps.push("Close the incident when the follow-up is done. It stays in the incident log for the NPC's annual report.");
  return steps;
}

const fmt = (iso: string | null) => (iso ? new Date(iso).toLocaleString("en-PH", { timeZone: "Asia/Manila", dateStyle: "long", timeStyle: "short" }) : "(not yet)");

/** The notice to affected members, English then Taglish. Covers what Part F requires. */
export function memberNotice(i: Incident): { subject: string; text: string } {
  const what = i.summary?.trim() || i.title;
  const data = i.data_involved?.trim() || "being confirmed";
  const did = i.measures?.trim() || "We closed the gap and are reviewing our systems.";
  const advice = i.member_advice?.trim() || "Change your FLAME PH password, and be careful with emails or messages that ask for your password or money.";
  return {
    subject: "Important: a security incident involving your FLAME PH data",
    text: [
      "We are writing to tell you about a security incident that involved some of your personal data.",
      "",
      `What happened: ${what}`,
      `When we learned of it: ${fmt(i.aware_at)}`,
      `Data involved: ${data}`,
      `What we did: ${did}`,
      `What you can do: ${advice}`,
      "",
      `Questions? Our Data Protection Officer: ${ORG.emailPrimary}. You may also file a complaint with the National Privacy Commission (privacy.gov.ph).`,
      "",
      "—",
      "Sumusulat kami para ipaalam ang isang security incident na may kinalaman sa ilan sa iyong personal na data.",
      `Ano ang nangyari: ${what}`,
      `Anong data: ${data}`,
      `Ano ang ginawa namin: ${did}`,
      `Ano ang puwede mong gawin: ${advice}`,
      `May tanong? Data Protection Officer: ${ORG.emailPrimary}.`,
    ].join("\n"),
  };
}

/** A draft for the NPC's breach report, for the DPO to copy into the NPC's online system and check. */
export function npcDraft(i: Incident): string {
  return [
    "PERSONAL DATA BREACH NOTIFICATION (draft for the DPO to check)",
    `Personal information controller: FLAME PH (formerly FAME Inc.), SEC Reg. No. ${ORG.secNo}`,
    `Data Protection Officer: ${ORG.emailPrimary}, ${ORG.address}`,
    "",
    `1. Nature of the breach: ${i.summary?.trim() || i.title}`,
    `2. Date and time FLAME PH became aware: ${fmt(i.aware_at)}`,
    `3. Personal data involved: ${i.data_involved?.trim() || "(to be completed)"}`,
    `4. Number of data subjects affected (estimate): ${i.affected_count ?? "(to be completed)"}`,
    `5. Measures taken to address the breach and reduce harm: ${i.measures?.trim() || "(to be completed)"}`,
    `6. Contained: ${fmt(i.contained_at)}`,
    `7. Notification of affected data subjects: ${i.members_notified_at ? `${fmt(i.members_notified_at)}, ${i.members_notified_count ?? 0} members` : "(planned within 72 hours)"}`,
    "8. Systems: flameph.org (hosting: Vercel; database and files: Supabase).",
  ].join("\n");
}
