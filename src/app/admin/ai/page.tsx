import { adminContext } from "@/lib/admin/guard";
import { reviewFeedback } from "../actions";

export default async function AiAdmin() {
  const { db } = await adminContext(["super_admin", "admin"]);
  const since = new Date(Date.now() - 30 * 86400_000).toISOString();
  const [{ data: msgs }, { data: fb }, { data: down }] = await Promise.all([
    db.from("ai_messages").select("created_at,input_tokens,output_tokens,cost_usd,feature").gte("created_at", since).limit(20000),
    db.from("ai_feedback").select("helpful"),
    db.from("ai_feedback").select("id,comment,created_at,ai_messages(question,answer,model)").eq("helpful", false).eq("reviewed", false).order("created_at", { ascending: false }).limit(50),
  ]);
  const byDay = new Map<string, { n: number; cost: number }>();
  let inTok = 0, outTok = 0, cost = 0;
  for (const m of msgs ?? []) {
    const d = new Date(new Date(m.created_at).getTime() + 8 * 3600_000).toISOString().slice(0, 10);
    const e = byDay.get(d) ?? { n: 0, cost: 0 }; e.n++; e.cost += Number(m.cost_usd ?? 0); byDay.set(d, e);
    inTok += m.input_tokens ?? 0; outTok += m.output_tokens ?? 0; cost += Number(m.cost_usd ?? 0);
  }
  const rated = fb?.length ?? 0; const up = (fb ?? []).filter((f) => f.helpful).length;
  const days = [...byDay.entries()].sort().reverse();
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-extrabold text-primary">Ka-FLAME AI review</h1>
      <div className="grid gap-3 sm:grid-cols-4">
        <div className="card p-4"><p className="text-sm text-muted">Questions (30 days)</p><p className="text-2xl font-extrabold">{msgs?.length ?? 0}</p></div>
        <div className="card p-4"><p className="text-sm text-muted">Helpful rate (all time)</p><p className="text-2xl font-extrabold">{rated ? `${Math.round((up / rated) * 100)}%` : "—"}</p><p className="text-xs text-muted">{rated} ratings</p></div>
        <div className="card p-4"><p className="text-sm text-muted">Tokens in / out (30 days)</p><p className="text-lg font-extrabold">{inTok.toLocaleString()} / {outTok.toLocaleString()}</p></div>
        <div className="card p-4"><p className="text-sm text-muted">Estimated cost (30 days)</p><p className="text-2xl font-extrabold">${cost.toFixed(2)}</p></div>
      </div>
      <div className="card overflow-x-auto p-4">
        <h2 className="font-bold">Questions per day</h2>
        {days.length === 0 ? <p className="text-muted">No questions yet.</p> : (
          <table className="mt-2 text-[15px]"><thead><tr><th className="pr-6 text-left">Day</th><th className="pr-6 text-left">Questions</th><th className="text-left">Est. cost</th></tr></thead>
            <tbody>{days.map(([d, e]) => <tr key={d}><td className="pr-6">{d}</td><td className="pr-6">{e.n}</td><td>${e.cost.toFixed(3)}</td></tr>)}</tbody></table>
        )}
      </div>
      <div>
        <h2 className="text-xl font-bold">Thumbs-down queue</h2>
        {(down ?? []).length === 0 ? <p className="text-muted">Nothing to review.</p> : (down ?? []).map((f) => {
          const m = (Array.isArray(f.ai_messages) ? f.ai_messages[0] : f.ai_messages) as { question: string; answer: string; model: string } | null;
          return (
            <div key={f.id} className="card mt-3 p-4">
              <p className="font-semibold">Q: {m?.question}</p>
              <p className="mt-1 whitespace-pre-line text-muted">{m?.answer}</p>
              {f.comment && <p className="mt-2 rounded bg-warn-soft p-2 text-warn">Member comment: {f.comment}</p>}
              <form action={reviewFeedback} className="mt-2"><input type="hidden" name="id" value={f.id} /><button className="btn btn-outline">Mark reviewed</button></form>
            </div>
          );
        })}
      </div>
    </div>
  );
}
