import "server-only";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/server";
import type { OfferStatus } from "@/lib/offers";
import type { OfferKind } from "@/lib/service-offers";

// Shared by the supplier actions (./actions) and the service provider actions (./service-actions). Not a server action
// itself, so it cannot be called from the browser.

const HOME = "/partner-us/offers";
const go = (path: string): never => redirect(path);

/** The member's own offer, read as the member (row level security), then the server key for writing. */
export async function ownOffer(id: string | null) {
  const { supabase, user } = await requireUser(HOME);
  if (!id) go(HOME);
  const { data: offer, error } = await supabase.from("supplier_offers").select("id, user_id, status, revision, title, kind").eq("id", id!).maybeSingle();
  if (error) go(`${HOME}?error=unavailable`);
  if (!offer || offer.user_id !== user.id) go(HOME);
  const admin = createAdminClient();
  if (!admin) go(`${HOME}?error=unavailable`);
  return { user, supabase, admin: admin!, offer: offer as { id: string; user_id: string; status: OfferStatus; revision: number; title: string | null; kind: OfferKind } };
}

