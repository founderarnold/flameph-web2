"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";

type Product = { id: string; name: string; description: string; price: string; image: string | null; url: string; store: { name: string; url: string | null } };
type Msg = { role: "user" | "ai"; text: string; id?: string | null; sources?: { title: string; slug: string }[]; rated?: boolean | null; error?: boolean; products?: Product[] };

const STARTERS = [
  "Paano mag-register ng BMBE?",
  "Paano ko ipe-presyo ang homemade na ube jam ko?",
  "Ano ang steps para makakuha ng Mayor's permit?",
  "Paano magsimula ng online selling sa maliit na puhunan?",
];

async function readStream(res: Response, onText: (t: string) => void) {
  const reader = res.body!.getReader();
  const dec = new TextDecoder();
  let buf = ""; let final: Record<string, unknown> = {};
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    const lines = buf.split("\n"); buf = lines.pop() ?? "";
    for (const line of lines) {
      if (!line.trim()) continue;
      const obj = JSON.parse(line);
      if (obj.t) onText(obj.t); else if (obj.done) final = obj;
    }
  }
  return final as { messageId?: string; conversationId?: string; sources?: { title: string; slug: string }[]; remaining?: number };
}

export function KaFlameChat() {
  const [tab, setTab] = useState<"chat" | "listing">("chat");
  return (
    <div className="mx-auto max-w-3xl">
      <div role="tablist" aria-label="Ka-FLAME features" className="mb-4 inline-flex rounded-xl border border-line p-1">
        {(["chat", "listing"] as const).map((t) => (
          <button key={t} role="tab" aria-selected={tab === t} onClick={() => setTab(t)} className={`min-h-11 rounded-lg px-4 font-semibold ${tab === t ? "bg-primary text-primary-fg" : ""}`}>
            {t === "chat" ? "Negosyo Q&A" : "Listing writer"}
          </button>
        ))}
      </div>
      {tab === "chat" ? <Chat /> : <ListingWriter />}
    </div>
  );
}

function Chat() {
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [conv, setConv] = useState<string | null>(null);
  const [limitMsg, setLimitMsg] = useState<{ text: string; guest?: boolean } | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => { try { setInput(localStorage.getItem("kf-draft") || ""); } catch {} }, []);
  useEffect(() => { endRef.current?.scrollIntoView({ block: "nearest" }); }, [msgs]);

  async function ask(q: string) {
    if (!q.trim() || busy) return;
    const history = [];
    for (let i = 0; i < msgs.length - 1; i++) if (msgs[i].role === "user" && msgs[i + 1].role === "ai" && !msgs[i + 1].error) history.push({ q: msgs[i].text, a: msgs[i + 1].text });
    setMsgs((m) => [...m, { role: "user", text: q }, { role: "ai", text: "" }]);
    setInput(""); try { localStorage.removeItem("kf-draft"); } catch {}
    setBusy(true); setLimitMsg(null);
    try {
      const res = await fetch("/api/ai/chat", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ question: q, history, conversationId: conv }) });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        setMsgs((m) => m.slice(0, -1).concat({ role: "ai", text: j.error || "May problema. Please try again.", error: true }));
        if (j.limit) setLimitMsg({ text: j.error, guest: j.guest });
        return;
      }
      let answer = "";
      const final = await readStream(res, (t) => (answer += t, setMsgs((m) => { const c = [...m]; c[c.length - 1] = { ...c[c.length - 1], text: c[c.length - 1].text + t }; return c; })));
      if (final.conversationId) setConv(final.conversationId);
      setMsgs((m) => { const c = [...m]; c[c.length - 1] = { ...c[c.length - 1], id: final.messageId, sources: final.sources }; return c; });
      void showProducts(q, answer, final.messageId ?? null);
    } catch {
      setMsgs((m) => m.slice(0, -1).concat({ role: "ai", text: navigator.onLine === false ? "Offline ka yata. Your question is still in the box; try again when you're back online." : "May problema sa connection. Please try again.", error: true }));
      setInput(q);
    } finally { setBusy(false); }
  }

  // Sample MarketplacePH products related to the question or answer, shown under the answer once it's done.
  async function showProducts(question: string, answer: string, id: string | null) {
    try {
      const res = await fetch("/api/marketplace/products", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ question, answer }) });
      const { items } = (await res.json()) as { items?: Product[] };
      if (items?.length) setMsgs((all) => all.map((x) => (x.role === "ai" && (id ? x.id === id : x.text === answer) ? { ...x, products: items } : x)));
    } catch {}
  }

  async function rate(i: number, helpful: boolean) {
    const m = msgs[i]; if (!m.id) return;
    const comment = helpful ? undefined : window.prompt("Ano ang mali o kulang? (optional)") ?? undefined;
    setMsgs((all) => all.map((x, j) => (j === i ? { ...x, rated: helpful } : x)));
    await fetch("/api/ai/feedback", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ messageId: m.id, helpful, comment }) }).catch(() => {});
  }

  return (
    <div className="card flex min-h-[60vh] flex-col">
      <div className="flex-1 space-y-4 overflow-y-auto p-4" aria-live="polite">
        {msgs.length === 0 && (
          <div>
            <p className="font-display text-lg font-bold">Kumusta, Ka-negosyo! Ano ang maitutulong ko?</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {STARTERS.map((s) => <button key={s} onClick={() => ask(s)} className="btn btn-outline min-h-11 px-3 text-left text-sm font-semibold">{s}</button>)}
            </div>
          </div>
        )}
        {msgs.map((m, i) => (
          <div key={i} className={m.role === "user" ? "flex justify-end" : ""}>
            <div className={`max-w-[90%] whitespace-pre-wrap rounded-2xl px-4 py-3 ${m.role === "user" ? "bg-primary text-primary-fg" : m.error ? "bg-warn-soft text-warn" : "bg-bg-soft"}`}>
              {m.text || <span className="inline-block h-4 w-24 skeleton" aria-label="Ka-FLAME is typing" />}
              {m.sources && m.sources.length > 0 && (
                <p className="mt-2 text-sm">Sources: {m.sources.map((s, j) => <span key={s.slug}>{j > 0 && ", "}<Link className="underline" href={`/resources/${s.slug}`}>{s.title}</Link></span>)}</p>
              )}
              {m.products && m.products.length > 0 && <Products items={m.products} />}
              {m.role === "ai" && m.id && (
                <div className="mt-2 flex items-center gap-1 text-sm">
                  {m.rated == null ? (<>
                    <span className="text-muted">Nakatulong ba?</span>
                    <button onClick={() => rate(i, true)} className="btn btn-ghost min-h-9 px-2" aria-label="Helpful">👍</button>
                    <button onClick={() => rate(i, false)} className="btn btn-ghost min-h-9 px-2" aria-label="Not helpful">👎</button>
                  </>) : <span className="text-muted">Salamat sa feedback!</span>}
                </div>
              )}
            </div>
          </div>
        ))}
        {limitMsg?.guest && <div className="rounded-xl bg-primary-soft p-4"><p className="font-semibold text-primary">{limitMsg.text}</p><Link href="/join?next=/bizconsult-ai" className="btn btn-flame mt-3">Join free</Link></div>}
        <div ref={endRef} />
      </div>
      <form onSubmit={(e) => { e.preventDefault(); ask(input); }} className="flex gap-2 border-t border-line p-3">
        <label htmlFor="kf-q" className="sr-only">Your question</label>
        <textarea id="kf-q" rows={2} maxLength={2000} value={input} placeholder="I-type ang tanong mo…" className="input resize-none"
          onChange={(e) => { setInput(e.target.value); try { localStorage.setItem("kf-draft", e.target.value); } catch {} }}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); ask(input); } }} />
        <button className="btn btn-primary shrink-0" disabled={busy || !input.trim()}>{busy ? "…" : "Send"}</button>
      </form>
    </div>
  );
}

function Products({ items }: { items: Product[] }) {
  return (
    <div className="mt-3 whitespace-normal border-t border-line pt-3">
      <p className="text-sm font-bold text-mph">🛍️ Related on MarketplacePH</p>
      <ul className="mt-2 grid gap-2">
        {items.map((p) => (
          <li key={p.id} className="flex gap-3 rounded-xl border border-line bg-bg p-2">
            {p.image && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={p.image} alt="" width={64} height={64} loading="lazy" className="h-16 w-16 shrink-0 rounded-lg object-cover" />
            )}
            <div className="min-w-0 text-sm">
              <a href={p.url} target="_blank" rel="noopener" className="font-semibold underline">{p.name}</a>
              {p.price && <span className="ml-1 text-muted">· {p.price}</span>}
              {p.description && <p className="line-clamp-2 text-muted">{p.description}</p>}
              <p className="text-xs">Store: {p.store.url ? <a href={p.store.url} target="_blank" rel="noopener" className="underline">{p.store.name}</a> : p.store.name}</p>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

function ListingWriter() {
  const [name, setName] = useState("");
  const [details, setDetails] = useState("");
  const [image, setImage] = useState<{ media_type: string; data: string } | null>(null);
  const [out, setOut] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]; if (!f) return setImage(null);
    // Downscale on the phone so we send a small image over mobile data.
    const bmp = await createImageBitmap(f);
    const scale = Math.min(1, 1024 / Math.max(bmp.width, bmp.height));
    const c = document.createElement("canvas"); c.width = Math.round(bmp.width * scale); c.height = Math.round(bmp.height * scale);
    c.getContext("2d")!.drawImage(bmp, 0, 0, c.width, c.height);
    const url = c.toDataURL("image/jpeg", 0.8);
    setImage({ media_type: "image/jpeg", data: url.split(",")[1] });
  }

  async function go(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setOut(""); setErr("");
    try {
      const res = await fetch("/api/ai/chat", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ feature: "listing", listing: { name, details, image } }) });
      if (!res.ok) { const j = await res.json().catch(() => ({})); setErr(j.error || "May problema."); return; }
      await readStream(res, (t) => setOut((o) => o + t));
    } catch { setErr("May problema sa connection. Please try again."); } finally { setBusy(false); }
  }

  return (
    <div className="grid gap-4">
      <form onSubmit={go} className="card space-y-4 p-5">
        <div><label className="label" htmlFor="ln">Product name *</label><input id="ln" required maxLength={200} value={name} onChange={(e) => setName(e.target.value)} className="input" placeholder="e.g. Homemade ube halaya" /></div>
        <div><label className="label" htmlFor="ld">A few details</label><textarea id="ld" rows={3} maxLength={2000} value={details} onChange={(e) => setDetails(e.target.value)} className="input" placeholder="Size, ingredients, price, where you deliver…" /></div>
        <div><label className="label" htmlFor="li">Photo (optional)</label><input id="li" type="file" accept="image/*" onChange={onFile} className="block min-h-11" /></div>
        <button className="btn btn-primary" disabled={busy}>{busy ? "Writing…" : "Write my listing"}</button>
      </form>
      {err && <p role="alert" className="rounded-lg bg-warn-soft p-3 text-warn">{err}</p>}
      {out && (
        <div className="card p-5">
          <div className="whitespace-pre-wrap" aria-live="polite">{out}</div>
          <button className="btn btn-outline mt-4" onClick={() => navigator.clipboard?.writeText(out)}>Copy</button>
          <p className="mt-2 text-sm text-muted">Paste into your <Link className="underline" href="/account/business">directory listing</Link> or <a className="underline" href="https://www.marketplaceph.com" target="_blank" rel="noopener">MarketplacePH</a> store. Check every detail before posting.</p>
        </div>
      )}
    </div>
  );
}
