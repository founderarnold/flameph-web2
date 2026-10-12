import { NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { createAdminClient, createClient } from "@/lib/supabase/server";
import { getAnonId } from "@/lib/ai/guard";

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const id = String(body.messageId || "");
  if (!/^[0-9a-f-]{36}$/.test(id) || typeof body.helpful !== "boolean") return NextResponse.json({ error: "Invalid" }, { status: 400 });
  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ error: "Unavailable" }, { status: 503 });
  const supabase = await createClient();
  const userId = supabase ? (await supabase.auth.getUser()).data.user?.id ?? null : null;
  const anonId = await getAnonId();
  const { data: msg } = await admin.from("ai_messages").select("id,user_id,anon_id").eq("id", id).single();
  if (!msg || (userId ? msg.user_id !== userId : msg.anon_id !== anonId)) return NextResponse.json({ error: "Not found" }, { status: 404 });
  await admin.from("ai_feedback").upsert({ message_id: id, user_id: userId, helpful: body.helpful, comment: typeof body.comment === "string" ? body.comment.slice(0, 1000) : null }, { onConflict: "message_id" });
  revalidateTag("stats");
  return NextResponse.json({ ok: true });
}
