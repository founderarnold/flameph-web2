"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { adminContext } from "@/lib/admin/guard";
import { eraseMember } from "@/lib/data-rights-server";
import { addWorkingDays, ANSWER_WORKING_DAYS, isRequestKind } from "@/lib/data-rights";
import { memberNotice, type Incident } from "@/lib/breach";
import { sendEmail } from "@/lib/email";

// Phase 12: the Data Protection Officer's tools. Admins and founders only. Every step goes to the audit log.

const ADMINS = ["super_admin", "admin"] as const;
const s = (v: FormDataEntryValue | null, max = 2000) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const ctx = () => adminContext([...ADMINS]);

// --- Requests -------------------------------------------------------------------------------------------------

export async function updateRequest(fd: FormData) {
  const c = await ctx();
  const id = s(fd.get("request_id"), 40);
  const step = s(fd.get("step"), 20);
  const response = s(fd.get("response"));
  const now = new Date().toISOString();
  const patch: Record<string, unknown> = { handled_by: c.user.id };
  if (step === "start") patch.status = "in_progress";
  else if (step === "done" || step === "refused") {
    if (response.length < 5) redirect(`/admin/privacy?error=response#r-${id}`);
    Object.assign(patch, { status: step, response, closed_at: now });
  } else if (step === "hold") {
    if (response.length < 5) redirect(`/admin/privacy?error=reason#r-${id}`);
    Object.assign(patch, { hold_reason: response, status: "in_progress" });
  } else if (step === "release") patch.hold_reason = null;
  else redirect("/admin/privacy?error=failed");
  const { error } = await c.db.from("privacy_requests").update(patch).eq("id", id);
  if (error) redirect("/admin/privacy?error=failed");
  await c.audit(`privacy_request_${step}`, "privacy_requests", id, step === "done" || step === "refused" ? { response } : step === "hold" ? { reason: response } : null);
  if ((step === "done" || step === "refused") && fd.get("tell") === "on") {
    const { data: r } = await c.db.from("privacy_requests").select("user_id, kind").eq("id", id).maybeSingle();
    if (r?.user_id) {
      await c.db.from("member_notifications").insert({ user_id: r.user_id, kind: "notice", title: "We answered your privacy request", body: response.slice(0, 300), url: "/account/privacy" });
      const { data: u } = await c.db.auth.admin.getUserById(r.user_id);
      if (u.user?.email) await sendEmail({ to: u.user.email, subject: "Your FLAME PH privacy request", text: `${response}\n\nSee all your requests: https://www.flameph.org/account/privacy` });
    }
  }
  revalidatePath("/admin/privacy");
  redirect(`/admin/privacy?done=${step}`);
}

export async function eraseNow(fd: FormData) {
  const c = await ctx();
  const id = s(fd.get("id"), 40);
  if (fd.get("confirm") !== "on") redirect(`/admin/privacy?error=confirm#r-${id}`);
  const { data: r } = await c.db.from("privacy_requests").select("user_id, kind, status").eq("id", id).maybeSingle();
  if (!r?.user_id || r.kind !== "erasure" || !["open", "in_progress"].includes(r.status)) redirect("/admin/privacy?error=failed");
  const res = await eraseMember(c.db, r!.user_id as string, { requestId: id, actorId: c.user.id, why: "erased by the DPO" });
  if (!res.ok) redirect(`/admin/privacy?error=${res.reason}#r-${id}`);
  revalidatePath("/admin/privacy");
  redirect("/admin/privacy?done=erased");
}

export async function closeNow(fd: FormData) {
  const c = await ctx();
  const id = s(fd.get("id"), 40);
  const { data: r } = await c.db.from("privacy_requests").select("user_id, kind, status").eq("id", id).maybeSingle();
  if (!r?.user_id || r.kind !== "closure" || r.status !== "open") redirect("/admin/privacy?error=failed");
  const { error } = await c.db.rpc("privacy_close_account", { p_user: r!.user_id, p_request: id });
  if (error) redirect("/admin/privacy?error=failed");
  await c.db.from("privacy_requests").update({ status: "done", closed_at: new Date().toISOString(), handled_by: c.user.id, response: "Account closed by the DPO. Data is erased 1 year after closing unless the member reopens it." }).eq("id", id);
  await c.audit("privacy_request_close_account", "privacy_requests", id);
  revalidatePath("/admin/privacy");
  redirect("/admin/privacy?done=closed");
}

/** A request that came by email or letter: log it so the 15-working-day clock runs. */
export async function logRequest(fd: FormData) {
  const c = await ctx();
  const code = s(fd.get("member_code"), 20).toUpperCase();
  const kind = s(fd.get("kind"), 20);
  const details = s(fd.get("details"));
  if (!isRequestKind(kind) || kind === "closure") redirect("/admin/privacy?error=failed#log");
  const { data: p } = await c.db.from("profiles").select("id, member_code").eq("member_code", code).maybeSingle();
  if (!p) redirect("/admin/privacy?error=member#log");
  const due = addWorkingDays(new Date(), ANSWER_WORKING_DAYS).toISOString();
  const { data: row, error } = await c.db.from("privacy_requests").insert({
    user_id: p!.id, member_code: p!.member_code, kind, details: details || null, source: "email", due_at: due,
    erase_after: kind === "erasure" ? due : null,
  }).select("id").single();
  if (error) redirect("/admin/privacy?error=failed#log");
  await c.audit("privacy_request_logged", "privacy_requests", row!.id, { kind });
  revalidatePath("/admin/privacy");
  redirect("/admin/privacy?done=logged");
}

// --- Incidents ------------------------------------------------------------------------------------------------

const INC = "/admin/privacy/incidents";

export async function startIncident(fd: FormData) {
  const c = await ctx();
  const title = s(fd.get("title"), 200);
  const aware = s(fd.get("aware_at"), 30);
  if (title.length < 3) redirect(`${INC}?error=title`);
  const awareAt = aware ? new Date(`${aware}:00+08:00`) : new Date();
  if (Number.isNaN(awareAt.getTime()) || awareAt.getTime() > Date.now() + 60_000) redirect(`${INC}?error=date`);
  const signal = s(fd.get("signal_id"), 20);
  const { data, error } = await c.db.from("security_incidents").insert({ title, summary: s(fd.get("summary"), 4000) || null, aware_at: awareAt.toISOString(), created_by: c.user.id }).select("id").single();
  if (error) redirect(`${INC}?error=failed`);
  if (signal) await c.db.from("security_signals").update({ incident_id: data!.id }).eq("id", Number(signal));
  await c.audit("incident_start", "security_incidents", data!.id, { title });
  redirect(`${INC}/${data!.id}?done=started`);
}

export async function updateIncident(fd: FormData) {
  const c = await ctx();
  const id = s(fd.get("incident_id"), 40);
  const step = s(fd.get("step"), 20);
  const now = new Date().toISOString();
  const back = `${INC}/${id}`;
  let patch: Record<string, unknown> = {};
  if (step === "details") {
    const count = s(fd.get("affected_count"), 10);
    const risk = s(fd.get("real_risk"), 5);
    patch = {
      title: s(fd.get("title"), 200) || undefined, summary: s(fd.get("summary"), 4000) || null, severity: ["low", "medium", "high"].includes(s(fd.get("severity"), 10)) ? s(fd.get("severity"), 10) : "medium",
      data_involved: s(fd.get("data_involved"), 1000) || null, affected_count: count ? Math.max(0, Number.parseInt(count, 10) || 0) : null,
      real_risk: risk === "yes" ? true : risk === "no" ? false : null, measures: s(fd.get("measures"), 4000) || null, member_advice: s(fd.get("member_advice"), 2000) || null,
    };
  } else if (step === "contained") patch = { contained_at: now, status: "contained" };
  else if (step === "npc") {
    const when = s(fd.get("npc_at"), 30);
    patch = { npc_notified_at: when ? new Date(`${when}:00+08:00`).toISOString() : now, npc_reference: s(fd.get("npc_reference"), 200) || null };
  } else if (step === "close") patch = { status: "closed", closed_at: now };
  else redirect(`${back}?error=failed`);
  const { error } = await c.db.from("security_incidents").update(patch).eq("id", id);
  if (error) redirect(`${back}?error=failed`);
  await c.audit(`incident_${step}`, "security_incidents", id, step === "npc" ? { reference: patch.npc_reference } : null);
  revalidatePath(back);
  redirect(`${back}?done=${step}`);
}

/**
 * Tells the affected members (Part F, step 3): an in-app notice and an email, with what happened, what data, what we
 * did, what they should do and how to reach the DPO. "All members" or a list of member codes.
 */
export async function notifyMembers(fd: FormData) {
  const c = await ctx();
  const id = s(fd.get("id"), 40);
  const back = `${INC}/${id}`;
  if (fd.get("confirm") !== "on") redirect(`${back}?error=confirm#notify`);
  const { data: inc } = await c.db.from("security_incidents").select("*").eq("id", id).maybeSingle();
  if (!inc) redirect(`${back}?error=failed`);
  const scope = s(fd.get("scope"), 10);
  let ids: string[] = [];
  if (scope === "all") {
    for (let from = 0; from < 50_000; from += 1000) {
      const { data } = await c.db.from("profiles").select("id").neq("status", "closed").order("id").range(from, from + 999);
      ids.push(...(data ?? []).map((r) => r.id as string));
      if (!data || data.length < 1000) break;
    }
  } else {
    const codes = s(fd.get("codes"), 20_000).toUpperCase().split(/[\s,;]+/).filter((x) => /^FP-\d{1,10}$/.test(x));
    if (!codes.length) redirect(`${back}?error=codes#notify`);
    const { data } = await c.db.from("profiles").select("id").in("member_code", codes.slice(0, 1000));
    ids = (data ?? []).map((r) => r.id as string);
  }
  const note = memberNotice(inc as Incident);
  let sent = 0;
  for (let i = 0; i < ids.length; i += 10) {
    const batch = ids.slice(i, i + 10);
    await c.db.from("member_notifications").insert(batch.map((uid) => ({ user_id: uid, kind: "notice", title: note.subject.slice(0, 140), body: (inc!.summary || inc!.title).slice(0, 300), url: "/account/privacy" })));
    const results = await Promise.all(batch.map(async (uid) => {
      const { data: u } = await c.db.auth.admin.getUserById(uid);
      return u.user?.email ? sendEmail({ to: u.user.email, subject: note.subject, text: note.text }) : false;
    }));
    sent += results.filter(Boolean).length;
  }
  await c.db.from("security_incidents").update({ members_notified_at: new Date().toISOString(), members_notified_count: ids.length }).eq("id", id);
  await c.audit("incident_notify_members", "security_incidents", id, { members: ids.length, emails_sent: sent });
  revalidatePath(back);
  redirect(`${back}?done=notified&n=${ids.length}&e=${sent}`);
}

// --- Security signals and retention ---------------------------------------------------------------------------

export async function dismissSignal(fd: FormData) {
  const c = await ctx();
  const id = Number(s(fd.get("id"), 20));
  await c.db.from("security_signals").update({ dismissed_at: new Date().toISOString(), dismissed_by: c.user.id }).eq("id", id);
  await c.audit("security_signal_dismiss", "security_signals", String(id));
  revalidatePath("/admin/privacy/security");
  redirect("/admin/privacy/security?done=dismissed");
}

export async function runScanNow() {
  const c = await ctx();
  await c.db.rpc("security_scan");
  await c.db.rpc("privacy_retention_run", { p_dry: true });
  await c.audit("security_scan_manual");
  revalidatePath("/admin/privacy/security");
  redirect("/admin/privacy/security?done=scanned");
}

