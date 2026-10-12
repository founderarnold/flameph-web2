import { NextResponse } from "next/server";
import { timingSafeEqual } from "crypto";
import { createAdminClient } from "@/lib/supabase/server";
import { runAi, type AiInput } from "@/lib/ai/run";
import { checkGate } from "@/lib/ai/guard";

export const maxDuration = 60;

// Server-to-server endpoint for partner platforms (e.g. MarketplacePH). Requires the AI_EMBED_KEY bearer token.
// Body: { feature: "chat" | "listing", question?, listing?: { name, details }, end_user_id: string }
export async function POST(req: Request) {
  const key = process.env.AI_EMBED_KEY;
  const given = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  if (!key || given.length !== key.length || !timingSafeEqual(Buffer.from(given), Buffer.from(key))) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const endUser = String(body.end_user_id || "").slice(0, 64);
  if (!endUser) return NextResponse.json({ error: "end_user_id required" }, { status: 400 });
  const feature = body.feature === "listing" ? "listing" : "chat";
  const input: AiInput = feature === "listing"
    ? { feature, question: String(body.listing?.name || ""), listing: { name: String(body.listing?.name || ""), details: String(body.listing?.details || "") } }
    : { feature, question: String(body.question || "").slice(0, 2000) };
  if (!input.question) return NextResponse.json({ error: "question required" }, { status: 400 });
  const admin = createAdminClient();
  if (!admin || !process.env.ANTHROPIC_API_KEY) return NextResponse.json({ error: "Unavailable" }, { status: 503 });
  const who = { userId: null, anonId: `embed-${endUser}`.slice(0, 40).padEnd(20, "x"), ipHash: `embed-${endUser}` };
  const gate = await checkGate(admin, who);
  if (!gate.ok) return NextResponse.json({ error: gate.reason }, { status: 429 });
  const result = await runAi({ admin, input, who, onText: () => {} });
  return NextResponse.json({ answer: result.answer, sources: result.sources, message_id: result.messageId });
}
