import { NextResponse } from "next/server";
import { isUnsubTopic } from "@/lib/notification-prefs";
import { verifyUnsubscribe } from "@/lib/unsubscribe";
import { applyUnsubscribe } from "@/lib/unsubscribe-apply";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** One-click unsubscribe from an email app's own "Unsubscribe" button (RFC 8058: a POST to the List-Unsubscribe address). */
export async function POST(req: Request) {
  const q = new URL(req.url).searchParams;
  const u = q.get("u") ?? "", t = q.get("t") ?? "", s = q.get("s") ?? "";
  if (!UUID.test(u) || !isUnsubTopic(t) || !verifyUnsubscribe(u, t, s)) return NextResponse.json({ error: "invalid_link" }, { status: 400 });
  const ok = await applyUnsubscribe(u, t);
  return NextResponse.json(ok ? { ok: true } : { error: "unavailable" }, { status: ok ? 200 : 503 });
}

/** A plain visit never changes anything: it opens the page with the confirm button. */
export async function GET(req: Request) {
  const url = new URL(req.url);
  return NextResponse.redirect(new URL(`/unsubscribe${url.search}`, url.origin), 303);
}
