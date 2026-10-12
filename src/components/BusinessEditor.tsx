"use client";
import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/browser";
import { SUPABASE_URL } from "@/lib/env";

type Biz = Record<string, unknown> & { id?: string; slug?: string; photos?: string[]; verification_docs?: string[]; verification_status?: string; verified?: boolean; published?: boolean };

const slugify = (s: string) => s.toLowerCase().normalize("NFKD").replace(/[^\w\s-]/g, "").trim().replace(/[\s_-]+/g, "-").slice(0, 50);
const FIELDS: { name: string; label: string; type?: string; textarea?: boolean; required?: boolean; help?: string }[] = [
  { name: "name", label: "Business name", required: true },
  { name: "description", label: "About your business", textarea: true, help: "Tip: Ka-FLAME AI's listing writer can help you write this." },
  { name: "products", label: "Products & services", textarea: true },
  { name: "city", label: "City / Municipality", required: true },
  { name: "contact_messenger", label: "Facebook page username or m.me link" },
  { name: "contact_viber", label: "Viber number", type: "tel" },
  { name: "contact_phone", label: "Phone number", type: "tel" },
  { name: "contact_email", label: "Business email", type: "email" },
  { name: "marketplaceph_url", label: "Your MarketplacePH store link", type: "url" },
];

export function BusinessEditor({ userId, initial, sectors, provinces }: { userId: string; initial: Biz | null; sectors: string[]; provinces: string[] }) {
  const supabase = createClient();
  const router = useRouter();
  const [biz, setBiz] = useState<Biz>(initial ?? { photos: [], verification_docs: [], published: false });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  if (!supabase) return <p className="mt-4 text-warn">Listings open once the database is connected.</p>;

  const set = (k: string, v: unknown) => setBiz((b) => ({ ...b, [k]: v }));

  async function upload(file: File, bucket: "media" | "private-docs") {
    if (file.size > 5 * 1024 * 1024) throw new Error("File too large (max 5 MB).");
    const path = `${userId}/${Date.now()}-${file.name.replace(/[^\w.-]/g, "_")}`;
    const { error } = await supabase!.storage.from(bucket).upload(path, file, { upsert: false });
    if (error) throw error;
    return path;
  }

  async function onPhotos(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []).slice(0, 6 - (biz.photos?.length ?? 0));
    setBusy(true);
    try { const paths = await Promise.all(files.map((f) => upload(f, "media"))); set("photos", [...(biz.photos ?? []), ...paths]); }
    catch (err) { setMsg({ ok: false, text: (err as Error).message }); }
    setBusy(false);
  }

  async function onDocs(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []).slice(0, 3);
    setBusy(true);
    try {
      const paths = await Promise.all(files.map((f) => upload(f, "private-docs")));
      setBiz((b) => ({ ...b, verification_docs: [...(b.verification_docs ?? []), ...paths], verification_status: "pending" }));
      setMsg({ ok: true, text: "Documents uploaded. Save your listing to submit them for review." });
    } catch (err) { setMsg({ ok: false, text: (err as Error).message }); }
    setBusy(false);
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setMsg(null);
    const payload: Record<string, unknown> = {
      owner_id: userId,
      name: biz.name, sector: biz.sector || null, description: biz.description || null, products: biz.products || null,
      city: biz.city, province: biz.province || null,
      contact_messenger: biz.contact_messenger || null, contact_viber: biz.contact_viber || null, contact_phone: biz.contact_phone || null,
      contact_email: biz.contact_email || null, marketplaceph_url: biz.marketplaceph_url || null,
      photos: biz.photos ?? [], verification_docs: biz.verification_docs ?? [], published: Boolean(biz.published),
      verification_status: biz.verification_status === "pending" ? "pending" : (biz.verification_status ?? "none"),
    };
    let error;
    if (biz.id) ({ error } = await supabase!.from("businesses").update(payload).eq("id", biz.id));
    else {
      const slug = `${slugify(String(biz.name || "negosyo"))}-${Math.random().toString(36).slice(2, 6)}`;
      const res = await supabase!.from("businesses").insert({ ...payload, slug }).select("id, slug").single();
      error = res.error;
      if (res.data) setBiz((b) => ({ ...b, ...res.data }));
    }
    setBusy(false);
    if (error) setMsg({ ok: false, text: error.message });
    else { setMsg({ ok: true, text: "Saved!" }); router.refresh(); }
  }

  return (
    <form onSubmit={save} className="card mt-6 space-y-4 p-5">
      {FIELDS.slice(0, 1).map((f) => <Input key={f.name} f={f} v={biz[f.name]} set={set} />)}
      <div>
        <label className="label" htmlFor="sector">Sector</label>
        <select id="sector" className="input" value={String(biz.sector ?? "")} onChange={(e) => set("sector", e.target.value)}>
          <option value="">Pumili…</option>{sectors.map((s) => <option key={s}>{s}</option>)}
        </select>
      </div>
      {FIELDS.slice(1, 4).map((f) => <Input key={f.name} f={f} v={biz[f.name]} set={set} />)}
      <div>
        <label className="label" htmlFor="province">Province</label>
        <select id="province" className="input" value={String(biz.province ?? "")} onChange={(e) => set("province", e.target.value)}>
          <option value="">Pumili…</option>{provinces.map((s) => <option key={s}>{s}</option>)}
        </select>
      </div>
      <fieldset className="space-y-4 rounded-xl border border-line p-4"><legend className="px-1 font-bold">Contact buttons</legend>
        {FIELDS.slice(4).map((f) => <Input key={f.name} f={f} v={biz[f.name]} set={set} />)}
      </fieldset>
      <div>
        <p className="label">Photos (up to 6)</p>
        <div className="flex flex-wrap gap-2">
          {(biz.photos ?? []).map((p) => (
            <div key={p} className="relative">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={`${SUPABASE_URL}/storage/v1/object/public/media/${p}`} alt="" className="h-20 w-20 rounded-lg object-cover" />
              <button type="button" aria-label="Remove photo" onClick={() => set("photos", (biz.photos ?? []).filter((x) => x !== p))} className="absolute -right-2 -top-2 grid h-7 w-7 place-items-center rounded-full bg-fg text-bg">×</button>
            </div>
          ))}
        </div>
        {(biz.photos?.length ?? 0) < 6 && <input type="file" accept="image/*" multiple onChange={onPhotos} className="mt-2 block min-h-11" aria-label="Upload photos" />}
      </div>
      <fieldset className="rounded-xl border border-line p-4">
        <legend className="px-1 font-bold">Get a Verified badge (optional)</legend>
        <p className="text-sm text-muted">Upload your DTI business name certificate, SEC registration or BMBE certificate. Only FLAME PH admins can see these files.</p>
        <p className="mt-2 text-sm font-semibold">Status: {biz.verified ? "✓ Verified" : biz.verification_status === "pending" ? "Pending review" : biz.verification_status === "rejected" ? "Not approved. Please upload clearer documents." : "Not submitted"}</p>
        {!biz.verified && <input type="file" accept="image/*,application/pdf" multiple onChange={onDocs} className="mt-2 block min-h-11" aria-label="Upload verification documents" />}
      </fieldset>
      <label className="flex items-start gap-2"><input type="checkbox" checked={Boolean(biz.published)} onChange={(e) => set("published", e.target.checked)} className="mt-1 h-5 w-5" /><span>Show my business publicly in the FLAME PH directory</span></label>
      {msg && <p role="status" className={`rounded-lg p-3 font-semibold ${msg.ok ? "bg-ok-soft text-ok" : "bg-red-50 text-red-800 dark:bg-red-950 dark:text-red-200"}`}>{msg.text}</p>}
      <div className="flex flex-wrap gap-2">
        <button className="btn btn-primary" disabled={busy}>{busy ? "Saving…" : "Save listing"}</button>
        {biz.slug && biz.published && <Link href={`/directory/${biz.slug}`} className="btn btn-outline">View public page</Link>}
      </div>
    </form>
  );
}

function Input({ f, v, set }: { f: (typeof FIELDS)[number]; v: unknown; set: (k: string, v: unknown) => void }) {
  const id = `biz-${f.name}`;
  return (
    <div>
      <label className="label" htmlFor={id}>{f.label}{f.required && " *"}</label>
      {f.textarea ? (
        <textarea id={id} rows={4} maxLength={3000} className="input" value={String(v ?? "")} onChange={(e) => set(f.name, e.target.value)} />
      ) : (
        <input id={id} type={f.type ?? "text"} required={f.required} maxLength={200} className="input" value={String(v ?? "")} onChange={(e) => set(f.name, e.target.value)} />
      )}
      {f.help && <p className="mt-1 text-sm text-muted">{f.help}</p>}
    </div>
  );
}
