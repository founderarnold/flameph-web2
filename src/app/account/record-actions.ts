"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { notify } from "@/lib/notify";
import { memberCards } from "@/lib/people";
import { cleanTags, DETAILS_MAX, parseAmount, recordErrorCode, RECORD_CATEGORIES, TERMS_MAX, TITLE_MAX } from "@/lib/records";
import { fulfillmentTitle } from "@/lib/fulfillment";

// Requests, quotes and transaction records. Every rule (consent 2, active account, mute, block, keyword filter,
// limits, who may see and change what, both sides confirming) is enforced by the database (0022); these actions
// only ask, tell the other member, and send the member back. No payment of any kind happens here.

const s = (v: FormDataEntryValue | null, max = 300) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const uuid = (v: string) => (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v) ? v : null);
const day = (v: string) => (/^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null);
const short = (t: string, n = 120) => (t.length > n ? `${t.slice(0, n - 1)}…` : t);

async function nameOf(supabase: Parameters<typeof memberCards>[0], id: string) {
  return (await memberCards(supabase, [id])).get(id)?.name ?? "A FLAME PH member";
}

/** A member asks for a product or service: sent to one member, or open to all members. */
export async function sendRequest(fd: FormData) {
  const { supabase, user } = await requireUser("/requests/new");
  const to = uuid(s(fd.get("provider_id"), 40));
  const title = s(fd.get("title"), TITLE_MAX);
  const category = s(fd.get("category"), 60);
  const back = `/requests/new${to ? `?to=${to}` : ""}`;
  const fail = (code: string) => redirect(`${back}${back.includes("?") ? "&" : "?"}error=${code}`);
  if (title.length < 3 || !(RECORD_CATEGORIES as readonly string[]).includes(category)) fail("bad_input");
  const { data, error } = await supabase.from("service_requests").insert({
    provider_id: to, title, category, details: s(fd.get("details"), DETAILS_MAX) || null, needed_by: day(s(fd.get("needed_by"), 10)),
  }).select("id").single();
  if (error || !data) fail(recordErrorCode(error?.message));
  if (to) {
    const name = await nameOf(supabase, user.id);
    await notify(to, "records", {
      title: `${name} sent you a request`, body: short(title), url: `/requests/${data!.id}`,
      email: { subject: `${name} asked your business for a quote on FLAME PH`, text: `${name} sent you a request:\n\n"${title}"\n\nOpen it in FLAME PH to send your terms. FLAME PH only records deals; no money passes through FLAME PH.` },
    });
  }
  revalidatePath("/requests");
  redirect(`/requests/${data!.id}?done=sent`);
}

/** A fulfillment request from the Fulfillment tab: the same request, titled "Fulfillment: <type> · <what>". */
export async function sendFulfillmentRequest(fd: FormData) {
  const { supabase, user } = await requireUser("/fulfillment");
  const to = uuid(s(fd.get("provider_id"), 40));
  const title = fulfillmentTitle(s(fd.get("type"), 20), s(fd.get("what"), 100));
  const category = s(fd.get("category"), 60);
  const fail = (code: string) => redirect(`/fulfillment?error=${code}${to ? `&to=${to}` : ""}#ask`);
  if (!title || !(RECORD_CATEGORIES as readonly string[]).includes(category)) fail("bad_input");
  const { data, error } = await supabase.from("service_requests").insert({
    provider_id: to, title: title!, category, details: s(fd.get("details"), DETAILS_MAX) || null, needed_by: day(s(fd.get("needed_by"), 10)),
  }).select("id").single();
  if (error || !data) fail(recordErrorCode(error?.message));
  if (to) {
    const name = await nameOf(supabase, user.id);
    await notify(to, "records", {
      title: `${name} sent you a fulfillment request`, body: short(title!), url: `/requests/${data!.id}`,
      email: { subject: `${name} asked your business for fulfillment help on FLAME PH`, text: `${name} sent you a fulfillment request:\n\n"${title}"\n\nOpen it in FLAME PH to send your terms. FLAME PH only records deals; no money passes through FLAME PH.` },
    });
  }
  revalidatePath("/requests");
  revalidatePath("/m/fulfillment");
  redirect(`/requests/${data!.id}?done=sent`);
}

export async function cancelRequest(fd: FormData) {
  const { supabase } = await requireUser("/requests");
  const id = uuid(s(fd.get("request_id"), 40));
  if (!id) redirect("/requests");
  const { error } = await supabase.rpc("cancel_request", { p_request: id });
  revalidatePath("/requests");
  redirect(`/requests/${id}?${error ? `error=${recordErrorCode(error.message)}` : "done=cancelled"}`);
}

/** A provider answers a request with terms (and an optional amount they type). */
export async function sendQuote(fd: FormData) {
  const { supabase, user } = await requireUser("/requests");
  const id = uuid(s(fd.get("request_id"), 40));
  if (!id) redirect("/requests");
  const terms = s(fd.get("terms"), TERMS_MAX);
  const amount = parseAmount(s(fd.get("amount"), 30));
  if (terms.length < 3) redirect(`/requests/${id}?error=bad_terms#quote`);
  if (Number.isNaN(amount)) redirect(`/requests/${id}?error=bad_amount#quote`);
  const { error } = await supabase.from("service_quotes").insert({ request_id: id, terms, amount, valid_until: day(s(fd.get("valid_until"), 10)) });
  if (error) redirect(`/requests/${id}?error=${recordErrorCode(error.message)}#quote`);
  const { data: r } = await supabase.from("service_requests").select("requester_id, title").eq("id", id).maybeSingle();
  if (r) {
    const name = await nameOf(supabase, user.id);
    await notify(r.requester_id, "records", {
      title: `${name} sent you a quote`, body: short(r.title), url: `/requests/${id}#quotes`,
      email: { subject: `${name} sent you a quote on FLAME PH`, text: `${name} answered your request "${r.title}" with their terms.\n\nOpen it in FLAME PH to compare quotes and accept one.` },
    });
  }
  revalidatePath("/requests");
  redirect(`/requests/${id}?done=quoted#quotes`);
}

export async function withdrawQuote(fd: FormData) {
  const { supabase } = await requireUser("/requests");
  const quote = uuid(s(fd.get("quote_id"), 40));
  const id = uuid(s(fd.get("request_id"), 40));
  if (!quote || !id) redirect("/requests");
  const { error } = await supabase.rpc("withdraw_quote", { p_quote: quote });
  revalidatePath("/requests");
  redirect(`/requests/${id}?${error ? `error=${recordErrorCode(error.message)}` : "done=withdrawn"}#quotes`);
}

/** The requester agrees to one quote. This opens a transaction record for both members. */
export async function acceptQuote(fd: FormData) {
  const { supabase, user } = await requireUser("/requests");
  const quote = uuid(s(fd.get("quote_id"), 40));
  const id = uuid(s(fd.get("request_id"), 40));
  if (!quote || !id) redirect("/requests");
  const { data, error } = await supabase.rpc("accept_quote", { p_quote: quote });
  if (error || !data) redirect(`/requests/${id}?error=${recordErrorCode(error?.message)}#quotes`);
  const { data: rec } = await supabase.from("transaction_records").select("provider_id, description").eq("id", data as string).maybeSingle();
  if (rec) {
    const name = await nameOf(supabase, user.id);
    await notify(rec.provider_id, "records", {
      title: `${name} accepted your quote`, body: short(rec.description), url: `/records/${data}`,
      email: { subject: `${name} accepted your quote on FLAME PH`, text: `${name} accepted your quote for "${rec.description}".\n\nAfter the work is done, both of you confirm the record in FLAME PH. Payment and delivery are between you and the other member; no money passes through FLAME PH.` },
    });
  }
  revalidatePath("/requests");
  revalidatePath("/records");
  redirect(`/records/${data}?done=accepted`);
}

/** One member confirms the work was done, with an optional amount, date, rating and endorsements. */
export async function confirmRecord(fd: FormData) {
  const { supabase, user } = await requireUser("/records");
  const id = uuid(s(fd.get("record_id"), 40));
  if (!id) redirect("/records");
  const amount = parseAmount(s(fd.get("amount"), 30));
  if (Number.isNaN(amount)) redirect(`/records/${id}?error=bad_amount#confirm`);
  const ratingRaw = Number(s(fd.get("rating"), 2));
  const rating = Number.isInteger(ratingRaw) && ratingRaw >= 1 && ratingRaw <= 5 ? ratingRaw : null;
  const { data, error } = await supabase.rpc("confirm_record", {
    p_record: id, p_amount: amount, p_rating: rating, p_tags: cleanTags(fd.getAll("tags")), p_deal_date: day(s(fd.get("deal_date"), 10)),
  });
  if (error) redirect(`/records/${id}?error=${recordErrorCode(error.message)}#confirm`);
  const { data: rec } = await supabase.from("transaction_records").select("requester_id, provider_id, description").eq("id", id).maybeSingle();
  if (rec) {
    const other = rec.requester_id === user.id ? rec.provider_id : rec.requester_id;
    const name = await nameOf(supabase, user.id);
    const done = data === "confirmed";
    await notify(other, "records", {
      title: done ? `Record confirmed with ${name}` : `${name} confirmed a record. Please confirm too`,
      body: short(rec.description), url: `/records/${id}`,
      email: done ? undefined : { subject: `${name} confirmed your deal on FLAME PH`, text: `${name} confirmed the record "${rec.description}".\n\nIt counts only after you confirm too. If something is wrong, open it and tap Dispute.` },
    });
  }
  revalidatePath("/records");
  redirect(`/records/${id}?done=${data === "confirmed" ? "confirmed" : "pending"}`);
}

/** Before anyone confirms, either member can cancel (the deal didn't happen). */
export async function cancelRecord(fd: FormData) {
  const { supabase } = await requireUser("/records");
  const id = uuid(s(fd.get("record_id"), 40));
  if (!id) redirect("/records");
  const { error } = await supabase.rpc("cancel_record", { p_record: id });
  revalidatePath("/records");
  redirect(`/records/${id}?${error ? `error=${recordErrorCode(error.message)}` : "done=cancelled"}`);
}
