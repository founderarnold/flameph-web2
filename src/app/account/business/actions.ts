"use server";
import { revalidatePath, revalidateTag } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { EXTRA_FIELDS } from "@/lib/listing";
import { regionOf } from "@/content/ph-regions";
import { SIGNED_OUT_MESSAGE, friendlyDbError } from "@/lib/db-errors";
import { checkListingAfterSave } from "@/lib/listing-auto-review";

/**
 * Saves the member's own business listing on the server.
 *
 * Why on the server: the browser used to write the row itself with `owner_id` taken from when the page was opened.
 * If the browser's sign-in had expired or changed since then (form left open a long time, signed out or into another
 * account in another tab), the database correctly refused the write with a raw "row-level security" error.
 * Here the owner is always the member signed in at the moment of saving, the session is refreshed by the middleware on
 * this request, and every error comes back as a plain sentence. Row level security still applies: this uses the
 * member's own session, never the service key.
 */

const TEXT = ["name", "sector", "description", "products", "city", "province", "contact_messenger", "contact_viber", "contact_phone", "contact_email", "marketplaceph_url"] as const;
const LIMITS: Record<string, number> = { description: 4000, products: 4000 };

/** What the automatic directory check did after the save (owner rule 25 Nov 2026: normal listings go public at once). */
export type ListingReview = { outcome: "publish" | "hold" | "high" | "skip" | "error"; emailNotConfirmed: boolean };

export type SaveListingResult =
  | { ok: true; id: string; slug: string; partial: boolean; review?: ListingReview }
  | { ok: false; error: string; signedOut?: boolean };

const str = (v: unknown, max = 300) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const paths = (v: unknown, max: number) => (Array.isArray(v) ? v.filter((p): p is string => typeof p === "string" && p.length > 0 && p.length <= 500).slice(0, max) : []);
const slugify = (s: string) => s.toLowerCase().normalize("NFKD").replace(/[^\w\s-]/g, "").trim().replace(/[\s_-]+/g, "-").slice(0, 50);
const missingColumn = (m: string) => /column|schema cache/i.test(m) && EXTRA_FIELDS.some((f) => m.includes(f));

export async function saveBusinessListing(input: Record<string, unknown>, opts: { id?: string; withExtras?: boolean } = {}): Promise<SaveListingResult> {
  const supabase = await createClient();
  if (!supabase) return { ok: false, error: "Listings open once the database is connected." };
  const { data: auth } = await supabase.auth.getUser();
  const user = auth.user;
  if (!user) return { ok: false, error: SIGNED_OUT_MESSAGE, signedOut: true };

  const name = str(input.name, 120);
  const city = str(input.city, 120);
  if (!name || !city) return { ok: false, error: "Please fill in your business name and city, then press Save again." };

  const row: Record<string, unknown> = { owner_id: user.id };
  for (const f of TEXT) row[f] = str(input[f], LIMITS[f] ?? 300) || null;
  row.name = name;
  row.city = city;
  row.region = regionOf(String(row.province ?? ""));
  row.photos = paths(input.photos, 6);
  row.verification_docs = paths(input.verification_docs, 10);
  // Members may only ask for review ("pending"); the database trigger keeps every other verification field as it was.
  const vs = str(input.verification_status, 20);
  row.verification_status = ["none", "pending", "approved", "rejected"].includes(vs) ? vs : "none";

  const extras = Object.fromEntries(EXTRA_FIELDS.map((f) => {
    const v = str(input[f], 500);
    return [f, !v ? null : f.endsWith("_url") && !f.startsWith("logo") && !f.startsWith("cover") && !/^https?:\/\//i.test(v) ? `https://${v}` : v];
  }));

  // Find the member's own listing on the server, so an old or wrong id from the page can never point at someone else's.
  const { data: mine, error: findError } = await supabase.from("businesses").select("id, slug").eq("owner_id", user.id).order("created_at").limit(1).maybeSingle();
  if (findError) return { ok: false, error: friendlyDbError(findError, "your listing") };
  if (opts.id && mine && opts.id !== mine.id) return { ok: false, error: "This page is out of date. Refresh the page, then save again." };

  const write = async (values: Record<string, unknown>) => {
    if (mine) {
      const res = await supabase.from("businesses").update(values).eq("id", mine.id).eq("owner_id", user.id).select("id, slug").maybeSingle();
      // No row back means nothing was saved: say so instead of a false "Saved!".
      if (!res.error && !res.data) return { data: null, error: { code: "PGRST116", message: "no row updated" } };
      return res;
    }
    const slug = `${slugify(name) || "negosyo"}-${Math.random().toString(36).slice(2, 6)}`;
    return supabase.from("businesses").insert({ ...values, slug }).select("id, slug").single();
  };

  let res = await write(opts.withExtras === false ? row : { ...row, ...extras });
  let partial = false;
  // Until the 0002 database update runs, the extra columns don't exist: save everything else instead of failing.
  if (res.error && missingColumn(String(res.error.message ?? ""))) { res = await write(row); partial = !res.error; }
  if (res.error || !res.data) {
    console.error("saveBusinessListing", user.id, res.error?.code, res.error?.message);
    return { ok: false, error: friendlyDbError(res.error, "your listing"), signedOut: res.error?.code === "42501" || undefined };
  }
  // Automatic directory check: a listing with nothing unusual goes on the public directory now. Documents, photos and a
  // mini website are optional. If the check cannot run, the listing is simply saved and the hourly check picks it up.
  // The save above used the member's own session (row level security). The check runs separately on the server.
  const r = await checkListingAfterSave(String(res.data.id));
  const review: ListingReview | undefined = r ? { outcome: r.outcome, emailNotConfirmed: r.codes.includes("email_not_verified") } : undefined;
  if (r && r.outcome !== "skip" && r.outcome !== "error") { revalidateTag("directory"); revalidateTag("content"); revalidatePath("/directory"); }
  revalidatePath("/account/business");
  revalidatePath("/account");
  return { ok: true, id: String(res.data.id), slug: String(res.data.slug), partial, review };
}
