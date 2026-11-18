"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { notify } from "@/lib/notify";
import { memberCards } from "@/lib/people";
import { RECORD_CATEGORIES } from "@/lib/records";
import { groupOrderErrorCode, parseStart } from "@/lib/group-order";
import { feedResult } from "@/lib/member-shell";

// Group Order: start one, send the bulk request to the supplier, or close it. Every rule (active member, limits,
// deadline, minimum, blocks, keyword filter, who may send) is enforced by the database (0024). No payment happens here:
// members pay the supplier directly.

const s = (v: FormDataEntryValue | null, max = 300) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const uuid = (v: string) => (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v) ? v : null);
const day = (v: string) => (/^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null);
const refresh = () => { revalidatePath("/group-order", "layout"); revalidatePath("/home"); };

export async function startGroupOrder(fd: FormData) {
  const { supabase } = await requireUser("/group-order/new");
  const { errors, value } = parseStart((k) => s(fd.get(k), k === "description" ? 1000 : 120));
  const supplierId = uuid(s(fd.get("supplier_id"), 40));
  const supplierQ = supplierId ? `&to=${supplierId}` : "";
  if (!(RECORD_CATEGORIES as readonly string[]).includes(value.p_category)) errors.unshift("bad_input");
  if (errors.length) redirect(`/group-order/new?error=${errors[0]}${supplierQ}`);
  const { data, error } = await supabase.rpc("start_group_order", { ...value, p_supplier_id: supplierId });
  if (error || !data) redirect(`/group-order/new?error=${groupOrderErrorCode(error?.message)}${supplierQ}`);
  refresh();
  redirect(feedResult("group-order-started", `deal-${data}`));
}

/** The organizer sends one bulk request to the supplier. Members who joined are told. */
export async function sendGroupOrder(fd: FormData) {
  const { supabase, user } = await requireUser("/group-order");
  const id = uuid(s(fd.get("deal_id"), 40));
  if (!id) redirect("/group-order");
  const { data: rid, error } = await supabase.rpc("send_group_order", { p_deal: id, p_needed_by: day(s(fd.get("needed_by"), 10)) });
  if (error || !rid) redirect(`/group-order/${id}?error=${groupOrderErrorCode(error?.message)}`);
  const [{ data: deal }, { data: joined }] = await Promise.all([
    supabase.from("deals").select("title, supplier_id").eq("id", id).maybeSingle(),
    supabase.rpc("group_order_members", { p_deal: id }),
  ]);
  const name = (await memberCards(supabase, [user.id])).get(user.id)?.name ?? "A FLAME PH member";
  const title = deal?.title ?? "your group order";
  if (deal?.supplier_id) {
    await notify(deal.supplier_id, "records", {
      title: `${name} sent you a group order`, body: title, url: `/requests/${rid}`,
      email: { subject: `${name} sent your business a group order on FLAME PH`, text: `${name} sent you a group order on FLAME PH: "${title}".\n\nOpen it in FLAME PH to send your terms. Each member pays you directly; no money passes through FLAME PH.` },
    });
  }
  // Tell the members who joined (at most 100), never the organizer.
  for (const m of ((joined ?? []) as { user_id: string; is_organizer: boolean }[]).filter((m) => !m.is_organizer).slice(0, 100)) {
    await notify(m.user_id, "records", { title: "Your group order was sent to the supplier", body: title, url: `/group-order/${id}` });
  }
  refresh();
  redirect(`/group-order/${id}?done=sent`);
}

export async function closeGroupOrder(fd: FormData) {
  const { supabase } = await requireUser("/group-order");
  const id = uuid(s(fd.get("deal_id"), 40));
  if (!id) redirect("/group-order");
  const { error } = await supabase.rpc("close_group_order", { p_deal: id });
  refresh();
  redirect(`/group-order/${id}?${error ? `error=${groupOrderErrorCode(error.message)}` : "done=closed"}`);
}
