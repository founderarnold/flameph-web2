import { NextResponse } from "next/server";
import { createAdminClient, createClient } from "@/lib/supabase/server";
import { checkGate, getAnonId } from "@/lib/ai/guard";
import { RESTING, runAi, type AiInput } from "@/lib/ai/run";
import { clientIpHash } from "@/lib/request";

export const maxDuration = 60;

function parse(body: Record<string, unknown>): AiInput | null {
  const feature = body.feature === "listing" ? "listing" : "chat";
  if (feature === "listing") {
    const l = body.listing as AiInput["listing"];
    if (!l || typeof l.name !== "string" || !l.name.trim() || typeof l.details !== "string") return null;
    if (l.image && (typeof l.image.data !== "string" || l.image.data.length > 2_800_000)) return null; // ~2 MB image
    return { feature, question: l.name, listing: { name: l.name.trim(), details: l.details.trim(), image: l.image } };
  }
  const q = typeof body.question === "string" ? body.question.trim() : "";
  if (!q || q.length > 2000) return null;
  const history = Array.isArray(body.history) ? (body.history as { q: string; a: string }[]).filter((h) => typeof h?.q === "string" && typeof h?.a === "string") : [];
  return { feature, question: q, history };
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const input = body ? parse(body) : null;
  if (!input) return NextResponse.json({ error: "Please type a question (up to 2,000 characters)." }, { status: 400 });

  const admin = createAdminClient();
  if (!admin || !process.env.ANTHROPIC_API_KEY) return NextResponse.json({ error: "Ka-FLAME AI is not connected yet. Please try again soon." }, { status: 503 });

  const supabase = await createClient();
  const userId = supabase ? (await supabase.auth.getUser()).data.user?.id ?? null : null;
  const who = { userId, anonId: await getAnonId(), ipHash: await clientIpHash() };

  const gate = await checkGate(admin, who);
  if (!gate.ok) {
    if (gate.reason === "resting") return NextResponse.json({ error: RESTING, resting: true }, { status: 429 });
    return NextResponse.json({
      error: userId
        ? `Naabot mo na ang ${gate.limit} na tanong para ngayong araw. Balik ka bukas!`
        : `Naabot mo na ang ${gate.limit} libreng tanong ngayong araw. Join free to get more questions every day.`,
      limit: true, guest: !userId,
    }, { status: 429 });
  }

  const enc = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (obj: unknown) => controller.enqueue(enc.encode(JSON.stringify(obj) + "\n"));
      const result = await runAi({ admin, input, who, conversationId: typeof body.conversationId === "string" ? body.conversationId : null, onText: (t) => send({ t }) });
      send({ done: true, messageId: result.messageId, conversationId: result.conversationId, sources: result.sources, remaining: Math.max(0, gate.limit - gate.used - 1) });
      controller.close();
    },
  });
  return new Response(stream, { headers: { "content-type": "application/x-ndjson; charset=utf-8", "cache-control": "no-store" } });
}
