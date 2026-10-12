import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import type { SupabaseClient } from "@supabase/supabase-js";
import { AI_MODEL, KAFLAME_SYSTEM, LISTING_INSTRUCTIONS, estimateCost, looksLikeInjection } from "./prompt";
import { findResources } from "./guard";

export type AiInput = {
  feature: "chat" | "listing";
  question: string;
  history?: { q: string; a: string }[];
  listing?: { name: string; details: string; image?: { media_type: string; data: string } };
};

export const RESTING = "Ka-FLAME is resting, try again tomorrow. Salamat sa pag-unawa!";
const INJECTION_REPLY = "Pasensya na, hindi ko masusunod ang hiling na iyan. Nandito ako para tumulong sa mga tanong tungkol sa negosyo. Ano ang gusto mong malaman tungkol sa pagsisimula o pagpapalago ng negosyo mo?";

const ALLOWED_IMG = ["image/jpeg", "image/png", "image/webp", "image/gif"];

export function buildMessages(input: AiInput, resources: { title: string; summary: string | null; body: string | null; last_reviewed: string | null }[]): { system: Anthropic.TextBlockParam[]; messages: Anthropic.MessageParam[] } {
  const system: Anthropic.TextBlockParam[] = [{ type: "text", text: KAFLAME_SYSTEM, cache_control: { type: "ephemeral" } }];
  const messages: Anthropic.MessageParam[] = [];
  for (const turn of (input.history ?? []).slice(-4)) {
    messages.push({ role: "user", content: `<user_message>${turn.q.slice(0, 2000)}</user_message>` });
    messages.push({ role: "assistant", content: turn.a.slice(0, 4000) });
  }
  const ctx = resources.length
    ? `<flameph_resources>\n${resources.map((r) => `Title: ${r.title}\nLast reviewed: ${r.last_reviewed ?? "n/a"}\nSummary: ${r.summary ?? ""}\nExcerpt: ${(r.body ?? "").slice(0, 1500)}`).join("\n---\n")}\n</flameph_resources>\n\n`
    : "";
  if (input.feature === "listing" && input.listing) {
    const content: Anthropic.ContentBlockParam[] = [];
    if (input.listing.image && ALLOWED_IMG.includes(input.listing.image.media_type)) {
      content.push({ type: "image", source: { type: "base64", media_type: input.listing.image.media_type as "image/jpeg", data: input.listing.image.data } });
    }
    content.push({ type: "text", text: `${LISTING_INSTRUCTIONS}\n\n<listing_details>\nProduct name: ${input.listing.name.slice(0, 200)}\nDetails: ${input.listing.details.slice(0, 2000)}\n</listing_details>` });
    messages.push({ role: "user", content });
  } else {
    messages.push({ role: "user", content: `${ctx}<user_message>${input.question.slice(0, 2000)}</user_message>` });
  }
  return { system, messages };
}

export function isInjection(input: AiInput) {
  return looksLikeInjection(input.question) || (input.listing ? looksLikeInjection(`${input.listing.name} ${input.listing.details}`) : false);
}

/** Streams an answer, calling onText for each chunk, then logs the exchange. Returns the logged message id. */
export async function runAi(opts: {
  admin: SupabaseClient; input: AiInput; who: { userId: string | null; anonId: string; ipHash: string };
  conversationId?: string | null; onText: (t: string) => void;
}): Promise<{ messageId: string | null; conversationId: string | null; answer: string; sources: { title: string; slug: string }[] }> {
  const { admin, input, who, onText } = opts;
  const started = Date.now();
  let answer = "";
  let usage = { input_tokens: 0, output_tokens: 0 };
  let resources: Awaited<ReturnType<typeof findResources>> = [];

  if (isInjection(input)) {
    answer = INJECTION_REPLY;
    onText(answer);
  } else {
    resources = input.feature === "chat" ? await findResources(admin, input.question) : [];
    const client = new Anthropic();
    const { system, messages } = buildMessages(input, resources);
    try {
      const stream = client.messages.stream({
        model: AI_MODEL,
        max_tokens: 4000,
        system,
        output_config: { effort: "low" },
        messages,
      });
      for await (const event of stream) {
        if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
          answer += event.delta.text;
          onText(event.delta.text);
        }
      }
      const final = await stream.finalMessage();
      usage = { input_tokens: final.usage.input_tokens + (final.usage.cache_read_input_tokens ?? 0) + (final.usage.cache_creation_input_tokens ?? 0), output_tokens: final.usage.output_tokens };
      if (final.stop_reason === "refusal" && !answer) {
        answer = "Pasensya na, hindi ko masasagot iyan. Puwede mo bang itanong sa ibang paraan, tungkol sa negosyo mo?";
        onText(answer);
      }
    } catch (err) {
      const msg = err instanceof Anthropic.RateLimitError ? "Maraming nagtatanong ngayon. Please try again in a minute." : "Nagka-problema si Ka-FLAME. Please try again.";
      if (!answer) onText(msg);
      console.error("Ka-FLAME error", err instanceof Anthropic.APIError ? `${err.status} ${err.message}` : err);
      return { messageId: null, conversationId: opts.conversationId ?? null, answer: msg, sources: [] };
    }
  }

  let conversationId = opts.conversationId ?? null;
  if (conversationId) {
    const { data } = await admin.from("ai_conversations").select("id,user_id,anon_id").eq("id", conversationId).single();
    if (!data || (who.userId ? data.user_id !== who.userId : data.anon_id !== who.anonId)) conversationId = null;
  }
  if (!conversationId) {
    const title = (input.feature === "listing" ? input.listing?.name : input.question)?.slice(0, 80) ?? "Conversation";
    const { data } = await admin.from("ai_conversations").insert({ user_id: who.userId, anon_id: who.userId ? null : who.anonId, feature: input.feature, title }).select("id").single();
    conversationId = data?.id ?? null;
  }
  let messageId: string | null = null;
  if (conversationId) {
    const { data } = await admin.from("ai_messages").insert({
      conversation_id: conversationId, user_id: who.userId, anon_id: who.userId ? null : who.anonId, ip_hash: who.ipHash,
      feature: input.feature,
      question: input.feature === "listing" ? `[Listing] ${input.listing?.name}: ${input.listing?.details}`.slice(0, 2500) : input.question.slice(0, 2000),
      answer, model: AI_MODEL, input_tokens: usage.input_tokens, output_tokens: usage.output_tokens,
      latency_ms: Date.now() - started, cost_usd: estimateCost(usage.input_tokens, usage.output_tokens),
      resources_used: resources.map((r) => r.id),
    }).select("id").single();
    messageId = data?.id ?? null;
  }
  return { messageId, conversationId, answer, sources: resources.map((r) => ({ title: r.title, slug: r.slug })) };
}
