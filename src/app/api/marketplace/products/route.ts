import { NextResponse } from "next/server";
import { findProducts, keywords } from "@/lib/marketplace";

export const maxDuration = 30;

/** Sample MarketplacePH products for a FLAME AI answer: POST { question, answer } → { items }. */
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const question = typeof body.question === "string" ? body.question.slice(0, 2000) : "";
  const answer = typeof body.answer === "string" ? body.answer.slice(0, 8000) : "";
  const items = await findProducts(keywords(question, answer)).catch(() => []);
  return NextResponse.json({ items }, { headers: { "cache-control": "no-store" } });
}
