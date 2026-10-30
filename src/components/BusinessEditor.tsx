"use client";
import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient, createEmailLinkClient } from "@/lib/supabase/browser";
import { SUPABASE_URL } from "@/lib/env";
import { EXTRA_FIELDS, SOCIALS } from "@/lib/listing";
import { businessStatusCopy, publicationStatusOf, type BusinessLifecycleStatus, type BusinessPublicationStatus } from "@/lib/business-lifecycle";
import { ListingStrength } from "./ListingStrength";
import type { AccountVerificationStatus } from "@/lib/account-verification";
import { Turnstile } from "@/components/Turnstile";
import { businessCompletion } from "@/lib/business-completion";
import { MODERATION_FIELD_MESSAGES, safeModerationFields } from "@/lib/business-moderation-feedback";

type Biz = Record<string, unknown> & {
  id?: string;
  slug?: string;
  photos?: string[];
  verification_docs?: string[];
  verification_status?: string;
  verified?: boolean;
  published?: boolean;
  lifecycle_status?: BusinessLifecycleStatus;
  publication_status?: BusinessPublicationStatus;
  risk_level?: "low" | "needs_review" | "high";
  moderation_fields?: string[];
  correction_count?: number;
};

const slugify = (s: string) => s.toLowerCase().normalize("NFKD").replace(/[^\w\s-]/g, "").trim().replace(/[\s_-]+/g, "-").slice(0, 50);
const FIELDS: { name: string; label: string; type?: string; textarea?: boolean; required?: boolean; help?: string }[] = [
  { name: "name", label: "Business name", required: true },
  { name: "description", label: "About your business", textarea: true, help: "Tip: FLAME AI's listing writer can help you write this." },
  { name: "products", label: "Products & services", textarea: true },
  { name: "city", label: "City / Municipality", required: true },
  { name: "contact_messenger", label: "Facebook page username or m.me link" },
  { name: "contact_viber", label: "Viber number", type: "tel" },
  { name: "contact_phone", label: "Phone number", type: "tel" },
  { name: "contact_email", label: "Business email", type: "email" },
  { name: "marketplaceph_url", label: "Your MarketplacePH store link", type: "url" },
];

const pub = (p: string) => p.startsWith("http") ? p : `${SUPABASE_URL}/storage/v1/object/public/media/${p}`;
const missingColumn = (m: string) => /column|schema cache/i.test(m) && EXTRA_FIELDS.some((f) => m.includes(f));

export function BusinessEditor({ userId, email, ownerName, verification, initial, sectors, provinces, supportsExtras = true }: { userId: string; email: string; ownerName: string; verification: AccountVerificationStatus; initial: Biz | null; sectors: string[]; provinces: string[]; supportsExtras?: boolean }) {
  const supabase = createClient();
  const router = useRouter();
  const [biz, setBiz] = useState<Biz>(initial ?? { photos: [], verification_docs: [], published: false, lifecycle_status: "draft", publication_status: "unpublished" });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [emailBotToken, setEmailBotToken] = useState("");
  const [emailBotReset, setEmailBotReset] = useState(0);
  const [submitBotToken, setSubmitBotToken] = useState("");
  const [submitBotReset, setSubmitBotReset] = useState(0);
  const [dirty, setDirty] = useState(false);
  const completion = businessCompletion(biz, ownerName, verification.email_verified);
  if (!supabase) return <p className="mt-4 text-warn">Listings open once the database is connected.</p>;

  const set = (k: string, v: unknown) => { setBiz((b) => ({ ...b, [k]: v })); setDirty(true); };

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

  async function onSingle(e: React.ChangeEvent<HTMLInputElement>, key: "logo_url" | "cover_url") {
    const file = e.target.files?.[0];
    if (!file) return;
    setBusy(true);
    try { set(key, await upload(file, "media")); }
    catch (err) { setMsg({ ok: false, text: (err as Error).message }); }
    setBusy(false);
  }

  async function onDocs(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []).slice(0, 3);
    setBusy(true);
    try {
      const paths = await Promise.all(files.map((f) => upload(f, "private-docs")));
      setBiz((b) => ({ ...b, verification_docs: [...(b.verification_docs ?? []), ...paths], verification_status: "pending" }));
      setDirty(true);
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
      photos: biz.photos ?? [], verification_docs: biz.verification_docs ?? [],
      verification_status: biz.verification_status === "pending" ? "pending" : (biz.verification_status ?? "none"),
    };
    const extras = Object.fromEntries(EXTRA_FIELDS.map((f) => {
      const v = typeof biz[f] === "string" ? String(biz[f]).trim() : "";
      return [f, !v ? null : f.endsWith("_url") && !f.startsWith("logo") && !f.startsWith("cover") && !/^https?:\/\//i.test(v) ? `https://${v}` : v];
    }));
    const write = async (row: Record<string, unknown>) => {
      if (biz.id) return (await supabase!.from("businesses").update(row).eq("id", biz.id)).error;
      const slug = `${slugify(String(biz.name || "negosyo"))}-${Math.random().toString(36).slice(2, 6)}`;
      const res = await supabase!.from("businesses").insert({ ...row, slug }).select("id, slug").single();
      if (res.data) setBiz((b) => ({ ...b, ...res.data }));
      return res.error;
    };
    let error = await write(supportsExtras ? { ...payload, ...extras } : payload);
    let partial = false;
    // Until the 0002 database update runs, the new columns don't exist: save everything else instead of failing.
    if (error && missingColumn(error.message)) { error = await write(payload); partial = !error; }
    setBusy(false);
    if (error) setMsg({ ok: false, text: error.message });
    else { setDirty(false); setMsg({ ok: true, text: partial ? "Saved! Logo, hours and links will be saved once FLAME PH finishes a database update." : "Saved!" }); router.refresh(); }
  }

  async function sendVerificationEmail() {
    if (!email || busy) return;
    setBusy(true); setMsg(null);
    const preflight = await fetch("/api/auth/otp/request", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email, createUser: false }),
    }).catch(() => null);
    const preflightBody = await preflight?.json().catch(() => ({}));
    if (!preflight?.ok) {
      setBusy(false);
      setMsg({ ok: false, text: preflightBody?.error ?? "Verification emails are temporarily unavailable." });
      return;
    }
    const { error } = await (createEmailLinkClient() ?? supabase!).auth.signInWithOtp({
      email,
      options: {
        captchaToken: emailBotToken,
        emailRedirectTo: `${window.location.origin}/auth/link?next=${encodeURIComponent("/account/business")}`,
        shouldCreateUser: false,
      },
    });
    setEmailBotReset((n) => n + 1);
    setBusy(false);
    setMsg(error
      ? { ok: false, text: /rate|seconds/i.test(error.message) ? "Please wait before requesting another verification email." : "Could not send the verification email. Please try again." }
      : { ok: true, text: "Verification email sent. Open the newest link, then return here to submit your business." });
  }

  async function submitForReview() {
    if (!biz.id || busy) return;
    setBusy(true); setMsg(null);
    const response = await fetch("/api/business/submit", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ businessId: biz.id, turnstileToken: submitBotToken }),
    }).catch(() => null);
    const result = await response?.json().catch(() => ({}));
    setSubmitBotReset((n) => n + 1);
    setBusy(false);
    if (!response?.ok) {
      if (result?.code === "BUSINESS_INFORMATION_NEEDS_CORRECTION") {
        const fields = safeModerationFields(result.fields);
        setBiz((current) => ({ ...current, risk_level: "high", moderation_fields: fields, lifecycle_status: "needs_correction", publication_status: "unpublished", published: false }));
      }
      return setMsg({ ok: false, text: result?.error ?? "Could not submit your business. Please try again." });
    }
    setBiz((current) => ({ ...current, risk_level: result?.riskLevel === "needs_review" ? "needs_review" : "low", moderation_fields: [], lifecycle_status: "submitted", publication_status: "unpublished", published: false }));
    setMsg({ ok: true, text: "Submitted for FLAME PH review. Your business remains private until it is approved and published." });
    router.refresh();
  }

  return (
    <form id="business-details" onSubmit={save} className="card mt-6 space-y-4 p-5">
      <BusinessStatus business={biz} />
      {biz.risk_level === "high" && <ModerationCorrection business={biz} />}
      <ListingStrength biz={biz} supportsExtras={supportsExtras} />
      <fieldset className="rounded-xl border border-line p-4">
        <legend className="px-1 font-bold">Required before review</legend>
        <ul className="space-y-2 text-sm">
          {completion.checks.map((check) => (
            <li key={check.key} className="flex gap-2">
              <span aria-hidden className={check.done ? "text-ok" : "text-muted"}>{check.done ? "✓" : "○"}</span>
              <span><strong>{check.label}</strong>{!check.done && <> — <span className="text-muted">{check.help}</span></>}</span>
            </li>
          ))}
        </ul>
        {!ownerName.trim() && <p className="mt-3 text-sm"><Link href="/account/profile" className="font-bold underline">Complete your member profile</Link> to identify the owner or authorized representative.</p>}
        <p className="mt-3 text-sm text-muted">Formal registration documents are optional. Aspiring entrepreneurs, home-based sellers, informal microbusinesses and startups may submit once the essentials above are complete.</p>
      </fieldset>
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
      {supportsExtras && <>
        <fieldset className="space-y-4 rounded-xl border border-line p-4"><legend className="px-1 font-bold">Logo & cover photo</legend>
          <div className="flex flex-wrap gap-6">
            <ImagePick label="Logo" hint="Square works best." path={biz.logo_url as string | undefined} round onPick={(e) => onSingle(e, "logo_url")} onClear={() => set("logo_url", null)} />
            <ImagePick label="Cover photo" hint="Wide photo of your shop or products." path={biz.cover_url as string | undefined} onPick={(e) => onSingle(e, "cover_url")} onClear={() => set("cover_url", null)} />
          </div>
        </fieldset>
        <fieldset className="space-y-4 rounded-xl border border-line p-4"><legend className="px-1 font-bold">Opening hours & location</legend>
          <Input f={{ name: "hours", label: "Opening hours", help: "Example: Mon to Sat, 8am to 6pm" }} v={biz.hours} set={set} />
          <Input f={{ name: "map_landmark", label: "Landmark or barangay for directions", help: "Something public like \"near Robinsons Place\" or \"Brgy. San Jose\". Never your home address." }} v={biz.map_landmark} set={set} />
        </fieldset>
        <fieldset className="space-y-4 rounded-xl border border-line p-4"><legend className="px-1 font-bold">Online links</legend>
          <p className="text-sm text-muted">Paste your page or shop link, like facebook.com/yourpage</p>
          {SOCIALS.map((x) => <Input key={x.key} f={{ name: x.key, label: x.label }} v={biz[x.key]} set={set} />)}
        </fieldset>
      </>}
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
        <p className="text-sm text-muted">Optional evidence may include DTI, SEC, CDA, BMBE, Mayor&apos;s/Business Permit, BIR documents or other legitimate proof. These files are not required for review, and only FLAME PH admins can see them.</p>
        <p className="mt-2 text-sm font-semibold">Status: {biz.verified ? "✓ Verified" : biz.verification_status === "pending" ? "Pending review" : biz.verification_status === "rejected" ? "Not approved. Please upload clearer documents." : "Not submitted"}</p>
        {!biz.verified && <input type="file" accept="image/*,application/pdf" multiple onChange={onDocs} className="mt-2 block min-h-11" aria-label="Upload verification documents" />}
      </fieldset>
      <fieldset className="rounded-xl border border-line p-4">
        <legend className="px-1 font-bold">Account verification for publication</legend>
        <div className="space-y-2 text-sm">
          <p><strong>Email:</strong> {verification.email_verified ? "✓ Verified" : "Verification required"}</p>
          {!verification.email_verified && <>
            <Turnstile action="auth" onToken={setEmailBotToken} resetKey={emailBotReset} />
            <button type="button" onClick={sendVerificationEmail} disabled={busy || !emailBotToken} className="btn btn-outline">Send verification email</button>
          </>}
          <p><strong>Mobile:</strong> {verification.mobile_verified ? "✓ Verified" : verification.mobile_required ? "Required before submission" : "Optional and not currently required"}</p>
          {verification.mobile_required && !verification.sms_provider_configured && <p className="text-warn">SMS verification is not configured yet. FLAME PH must configure a provider before making mobile verification mandatory.</p>}
        </div>
      </fieldset>
      <p className="rounded-xl bg-bg-soft p-4 text-sm text-muted">Saving updates your draft. Publication is controlled by FLAME PH&apos;s review process and cannot be enabled from the browser.</p>
      {dirty && <p className="rounded-lg bg-warn-soft p-3 text-sm font-semibold text-warn">Save your latest changes before submitting for review.</p>}
      {biz.id && completion.complete && !dirty && ["draft", "needs_correction", "rejected"].includes(String(biz.lifecycle_status ?? "draft")) && (
        <Turnstile action="business_submit" onToken={setSubmitBotToken} resetKey={submitBotReset} />
      )}
      {msg && <p role="status" className={`rounded-lg p-3 font-semibold ${msg.ok ? "bg-ok-soft text-ok" : "bg-red-50 text-red-800 dark:bg-red-950 dark:text-red-200"}`}>{msg.text}</p>}
      <div className="flex flex-wrap gap-2">
        <button className="btn btn-primary" disabled={busy}>{busy ? "Saving…" : "Save listing"}</button>
        {biz.id && ["draft", "needs_correction", "rejected"].includes(String(biz.lifecycle_status ?? "draft")) && (
          <button type="button" onClick={submitForReview} disabled={busy || dirty || !completion.complete || !submitBotToken || (verification.mobile_required && !verification.mobile_verified)} className="btn btn-flame">Submit for review</button>
        )}
        {biz.id && <Link href="/account/business/preview" className="btn btn-outline">Preview private listing</Link>}
        {biz.slug && biz.published && <Link href={`/directory/${biz.slug}`} className="btn btn-outline">View public page</Link>}
      </div>
    </form>
  );
}

function ModerationCorrection({ business }: { business: Biz }) {
  const fields = safeModerationFields(business.moderation_fields);
  return (
    <section className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-amber-950 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-100" aria-labelledby="moderation-correction-title">
      <h2 id="moderation-correction-title" className="font-bold">Business Information Needs Correction</h2>
      <p className="mt-1 text-sm">This listing is not currently shown in the FLAME PH directory. Some information needs correction before it can be submitted for review.</p>
      <ul className="mt-3 list-disc space-y-1 pl-5 text-sm">
        {(fields.length ? fields : ["profile" as const]).map((field) => <li key={field}>{MODERATION_FIELD_MESSAGES[field]}</li>)}
      </ul>
      <p className="mt-3 text-sm">Edit the fields below, save the same listing, then submit it again. Your existing photos and information will stay with this record.</p>
      <Link href="/membership/terms" className="mt-2 inline-block text-sm font-bold underline">Learn about business verification</Link>
    </section>
  );
}

function BusinessStatus({ business }: { business: Biz }) {
  const status = businessStatusCopy(business);
  const tone = status.tone === "ok" ? "border-ok/30 bg-ok-soft text-ok" : status.tone === "warn" ? "border-gold/40 bg-warn-soft text-warn" : "border-line bg-bg-soft text-muted";
  return (
    <section className={`rounded-xl border p-4 ${tone}`} aria-label="Business directory status">
      <p className="font-bold">{status.label}</p>
      <p className="mt-1 text-sm">{status.detail}</p>
      {publicationStatusOf(business) !== "published" && <p className="mt-1 text-sm">Your business will not appear publicly until it meets FLAME PH&apos;s directory requirements.</p>}
    </section>
  );
}

function ImagePick({ label, hint, path, round, onPick, onClear }: { label: string; hint: string; path?: string | null; round?: boolean; onPick: (e: React.ChangeEvent<HTMLInputElement>) => void; onClear: () => void }) {
  return (
    <div>
      <p className="label">{label}</p>
      {path ? (
        <div className="relative inline-block">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={pub(path)} alt="" className={round ? "h-20 w-20 rounded-full object-cover" : "h-20 w-36 rounded-lg object-cover"} />
          <button type="button" aria-label={`Remove ${label.toLowerCase()}`} onClick={onClear} className="absolute -right-2 -top-2 grid h-7 w-7 place-items-center rounded-full bg-fg text-bg">×</button>
        </div>
      ) : <p className="text-sm text-muted">{hint}</p>}
      <input type="file" accept="image/*" onChange={onPick} className="mt-2 block min-h-11" aria-label={`Upload ${label.toLowerCase()}`} />
    </div>
  );
}

function Input({ f, v, set }: { f: { name: string; label: string; type?: string; textarea?: boolean; required?: boolean; help?: string }; v: unknown; set: (k: string, v: unknown) => void }) {
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
