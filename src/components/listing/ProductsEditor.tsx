"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/browser";
import { SUPABASE_URL } from "@/lib/env";
import { peso } from "@/lib/growth";

export type ProductRow = {
  id?: string; name: string; description: string | null; price: number | null; price_from: boolean; unit: string | null;
  min_order: string | null; photo_path: string | null; link_url: string | null; sort: number;
};

const EMPTY: ProductRow = { name: "", description: null, price: null, price_from: false, unit: null, min_order: null, photo_path: null, link_url: null, sort: 0 };
const MAX = 20;

/** Products and packages with prices, shown as cards on the public listing. */
export function ProductsEditor({ userId, businessId, initial }: { userId: string; businessId: string; initial: ProductRow[] }) {
  const supabase = createClient();
  const router = useRouter();
  const [rows, setRows] = useState<ProductRow[]>(initial);
  const [draft, setDraft] = useState<ProductRow | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  if (!supabase) return null;

  async function onPhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !draft) return;
    if (file.size > 5 * 1024 * 1024) return setMsg({ ok: false, text: "Photo too large (max 5 MB)." });
    setBusy(true);
    const path = `${userId}/product-${Date.now()}-${file.name.replace(/[^\w.-]/g, "_")}`;
    const { error } = await supabase!.storage.from("media").upload(path, file);
    setBusy(false);
    if (error) return setMsg({ ok: false, text: error.message });
    setDraft({ ...draft, photo_path: path });
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!draft) return;
    setBusy(true); setMsg(null);
    const link = draft.link_url?.trim();
    const payload = {
      business_id: businessId, owner_id: userId, name: draft.name.trim(), description: draft.description?.trim() || null,
      price: draft.price === null || Number.isNaN(draft.price) ? null : draft.price, price_from: draft.price_from,
      unit: draft.unit?.trim() || null, min_order: draft.min_order?.trim() || null, photo_path: draft.photo_path,
      link_url: link ? (/^https?:\/\//i.test(link) ? link : `https://${link}`) : null, sort: draft.sort,
    };
    const res = draft.id
      ? await supabase!.from("business_products").update(payload).eq("id", draft.id).select("*").single()
      : await supabase!.from("business_products").insert({ ...payload, sort: rows.length }).select("*").single();
    setBusy(false);
    if (res.error) {
      return setMsg({ ok: false, text: /business_products/.test(res.error.message) ? "Products open once FLAME PH finishes a database update. Please try again later." : res.error.message });
    }
    const saved = res.data as ProductRow;
    setRows((r) => (draft.id ? r.map((x) => (x.id === draft.id ? saved : x)) : [...r, saved]));
    setDraft(null);
    setMsg({ ok: true, text: "Product saved." });
    router.refresh();
  }

  async function remove(id?: string) {
    if (!id) return;
    setBusy(true);
    const { error } = await supabase!.from("business_products").delete().eq("id", id);
    setBusy(false);
    if (error) return setMsg({ ok: false, text: error.message });
    setRows((r) => r.filter((x) => x.id !== id));
    router.refresh();
  }

  async function move(i: number, dir: -1 | 1) {
    const j = i + dir;
    if (j < 0 || j >= rows.length) return;
    const next = [...rows];
    [next[i], next[j]] = [next[j], next[i]];
    setRows(next);
    await Promise.all(next.map((x, k) => supabase!.from("business_products").update({ sort: k }).eq("id", x.id!)));
    router.refresh();
  }

  const set = (k: keyof ProductRow, v: unknown) => setDraft((d) => (d ? { ...d, [k]: v } : d));

  return (
    <section id="products" className="card mt-6 scroll-mt-24 space-y-4 p-5">
      <div>
        <h2 className="text-xl font-extrabold">Products & packages with prices</h2>
        <p className="mt-1 text-sm text-muted">Shown as cards with an Inquire button on your public listing. Prices answer the first question every buyer asks.</p>
      </div>
      {rows.length > 0 && (
        <ul className="space-y-2">
          {rows.map((p, i) => (
            <li key={p.id} className="flex items-center gap-3 rounded-xl border border-line p-2">
              {p.photo_path
                // eslint-disable-next-line @next/next/no-img-element
                ? <img src={`${SUPABASE_URL}/storage/v1/object/public/media/${p.photo_path}`} alt="" className="h-12 w-12 rounded-lg object-cover" />
                : <span aria-hidden className="grid h-12 w-12 place-items-center rounded-lg bg-primary-soft font-bold text-primary">{p.name.slice(0, 1)}</span>}
              <div className="min-w-0 flex-1"><p className="truncate font-bold">{p.name}</p><p className="text-sm text-muted">{p.price !== null ? `${p.price_from ? "from " : ""}${peso(p.price)}${p.unit ? ` / ${p.unit}` : ""}` : "No price yet"}</p></div>
              <div className="flex shrink-0 gap-1">
                <button type="button" aria-label={`Move ${p.name} up`} className="btn btn-ghost min-h-9 px-2" disabled={busy || i === 0} onClick={() => move(i, -1)}>↑</button>
                <button type="button" aria-label={`Move ${p.name} down`} className="btn btn-ghost min-h-9 px-2" disabled={busy || i === rows.length - 1} onClick={() => move(i, 1)}>↓</button>
                <button type="button" className="btn btn-outline min-h-9 px-3 text-sm" onClick={() => setDraft(p)}>Edit</button>
                <button type="button" className="btn btn-ghost min-h-9 px-3 text-sm" disabled={busy} onClick={() => remove(p.id)}>Remove</button>
              </div>
            </li>
          ))}
        </ul>
      )}
      {draft ? (
        <form onSubmit={save} className="space-y-3 rounded-xl border border-line bg-bg-soft p-4">
          <div><label className="label" htmlFor="pr-name">Product or package name *</label><input id="pr-name" required maxLength={120} className="input" value={draft.name} onChange={(e) => set("name", e.target.value)} placeholder="e.g. Pizza Negosyo Starter Package" /></div>
          <div><label className="label" htmlFor="pr-desc">Short description</label><textarea id="pr-desc" rows={2} maxLength={600} className="input" value={draft.description ?? ""} onChange={(e) => set("description", e.target.value)} placeholder="What's included, sizes, flavors" /></div>
          <div className="grid gap-3 sm:grid-cols-3">
            <div><label className="label" htmlFor="pr-price">Price (₱)</label><input id="pr-price" type="number" min={0} step="0.01" inputMode="decimal" className="input" value={draft.price ?? ""} onChange={(e) => set("price", e.target.value === "" ? null : Number(e.target.value))} /></div>
            <div><label className="label" htmlFor="pr-unit">Per</label><input id="pr-unit" maxLength={30} className="input" value={draft.unit ?? ""} onChange={(e) => set("unit", e.target.value)} placeholder="pack, kilo, box" /></div>
            <div><label className="label" htmlFor="pr-min">Minimum order</label><input id="pr-min" maxLength={60} className="input" value={draft.min_order ?? ""} onChange={(e) => set("min_order", e.target.value)} placeholder="e.g. 5 packs" /></div>
          </div>
          <label className="flex items-center gap-2"><input type="checkbox" checked={draft.price_from} onChange={(e) => set("price_from", e.target.checked)} className="h-5 w-5" /> Show as a starting price (&quot;from ₱…&quot;)</label>
          <div><label className="label" htmlFor="pr-link">Order link (MarketplacePH, Shopee, Lazada)</label><input id="pr-link" type="url" maxLength={300} className="input" value={draft.link_url ?? ""} onChange={(e) => set("link_url", e.target.value)} placeholder="https://www.marketplaceph.com/listing/…" /></div>
          <div>
            <p className="label">Photo</p>
            {draft.photo_path && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={`${SUPABASE_URL}/storage/v1/object/public/media/${draft.photo_path}`} alt="" className="mb-2 h-20 w-20 rounded-lg object-cover" />
            )}
            <input type="file" accept="image/*" onChange={onPhoto} className="block min-h-11" aria-label="Upload product photo" />
          </div>
          <div className="flex flex-wrap gap-2">
            <button className="btn btn-primary" disabled={busy}>{busy ? "Saving…" : "Save product"}</button>
            <button type="button" className="btn btn-ghost" onClick={() => setDraft(null)}>Cancel</button>
          </div>
        </form>
      ) : rows.length < MAX && <button type="button" className="btn btn-outline" onClick={() => { setMsg(null); setDraft({ ...EMPTY }); }}>+ Add a product or package</button>}
      {msg && <p role="status" className={`rounded-lg p-3 font-semibold ${msg.ok ? "bg-ok-soft text-ok" : "bg-warn-soft text-warn"}`}>{msg.text}</p>}
    </section>
  );
}
