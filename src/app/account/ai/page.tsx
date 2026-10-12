import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { deleteAiConversation } from "../actions";

export default async function AiHistory() {
  const { supabase, user } = await requireUser("/account/ai");
  const { data: convs } = await supabase.from("ai_conversations").select("id, title, feature, created_at, ai_messages(id, question, answer, created_at)").eq("user_id", user.id).order("created_at", { ascending: false }).limit(50);
  return (
    <div className="max-w-3xl space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-3xl font-extrabold text-primary">Ka-FLAME AI history</h1>
        {convs && convs.length > 0 && <form action={deleteAiConversation}><input type="hidden" name="id" value="all" /><button className="btn btn-outline text-sm">Delete all history</button></form>}
      </div>
      {!convs || convs.length === 0 ? <p className="text-muted">No conversations yet. <Link href="/bizconsult-ai" className="underline">Ask Ka-FLAME AI</Link></p> : convs.map((c) => (
        <details key={c.id} className="card p-4">
          <summary className="cursor-pointer font-bold">{c.title ?? "Conversation"} <span className="text-sm font-normal text-muted">· {c.feature === "listing" ? "Listing writer" : "Q&A"} · {new Date(c.created_at).toLocaleDateString("en-PH", { dateStyle: "medium" })}</span></summary>
          <div className="mt-3 space-y-3">
            {(c.ai_messages ?? []).sort((a, b) => a.created_at.localeCompare(b.created_at)).map((m) => (
              <div key={m.id}><p className="font-semibold">Q: {m.question}</p><p className="mt-1 whitespace-pre-line text-muted">{m.answer}</p></div>
            ))}
          </div>
          <form action={deleteAiConversation} className="mt-3"><input type="hidden" name="id" value={c.id} /><button className="btn btn-ghost text-sm text-red-700 dark:text-red-300">Delete this conversation</button></form>
        </details>
      ))}
    </div>
  );
}
