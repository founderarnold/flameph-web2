"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
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
import { SIGNED_OUT_MESSAGE, friendlyDbError } from "@/lib/db-errors";
import { saveBusinessListing, syncMarketplaceStore } from "@/app/account/business/actions";
import { DESCRIPTION_MIN, isStep, neighbour, type SectionKey, type StoreSummary } from "@/lib/listing-sections";
import { LINK_PLACEHOLDER, normalizeLink, type LinkKind } from "@/lib/links";
import { useGoToSection } from "@/components/listing/ListingSections";

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

const FIELDS: { name: string; label: string; type?: string; textarea?: boolean; required?: boolean; help?: string }[] = [
  { name: "name", label: "Business name", required: true },
  { name: "description", label: "About your business", textarea: true, help: "Tip: FLAME AI's listing writer can help you write this." },
  { name: "products", label: "Products & services", textarea: true },
  { name: "city", label: "City / Municipality", required: true },
  { name: "contact_messenger", label: "Facebook page username or m.me link" },
  { name: "contact_viber", label: "Viber number", type: "tel" },
  { name: "contact_phone", label: "Phone number", type: "tel" },
  { name: "contact_email", label: "Business email", type: "email" },
  { name: "marketplaceph_url", label: "Your MarketplacePH store link" },
];

const pub = (p: string) => p.startsWith("http") ? p : `${SUPABASE_URL}/storage/v1/object/public/media/${p}`;
/** The fields a member edits; everything else on the listing is set by FLAME PH. */
const fieldsOf = (biz: Biz): Record<string, unknown> => ({
  name: biz.name, sector: biz.sector, description: biz.description, products: biz.products,
  city: biz.city, province: biz.province,
  contact_messenger: biz.contact_messenger, contact_viber: biz.contact_viber, contact_phone: biz.contact_phone,
  contact_email: biz.contact_email, marketplaceph_url: biz.marketplaceph_url,
  photos: biz.photos ?? [], verification_docs: biz.verification_docs ?? [],
  verification_status: biz.verification_status === "pending" ? "pending" : (biz.verification_status ?? "none"),
  ...Object.fromEntries(EXTRA_FIELDS.map((f) => [f, biz[f]])),
});
/** Unsaved details are kept in this browser if a save fails because the sign-in expired, and come back after logging in. */
const draftKey = (userId: string) => `flameph-listing-draft:${userId}`;

export function BusinessEditor({ userId, email, ownerName, verification, initial, sectors, provinces, supportsExtras = true, section = "basics", query = "", store = { linked: false, summary: null } }: { userId: string; email: string; ownerName: string; verification: AccountVerificationStatus; initial: Biz | null; sectors: string[]; provinces: string[]; supportsExtras?: boolean; section?: SectionKey; query?: string; store?: { linked: boolean; summary: StoreSummary | null } }) {
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
  const [signedOut, setSignedOut] = useState(false);
  const completion = businessCompletion(biz, ownerName, verification.email_verified);
  const goTo = useGoToSection(query);
  /** Where "Save and continue" goes once the save worked. */
  const afterSave = useRef<SectionKey | null>(null);
  /** Step 6's "Save and publish": publish right after the save when everything needed is in. */
  const publishAfterSave = useRef(false);
  useEffect(() => {
    try {
      const saved = localStorage.getItem(draftKey(userId));
      if (!saved) return;
      localStorage.removeItem(draftKey(userId));
      const draft = JSON.parse(saved) as Biz;
      setBiz((b) => ({ ...b, ...draft, id: b.id, slug: b.slug }));
      setDirty(true);
      setMsg({ ok: true, text: "We brought back the details you typed before your sign-in expired. Press Save listing to keep them." });
    } catch { /* storage blocked: nothing to restore */ }
  }, [userId]);
  if (!supabase) return <p className="mt-4 text-warn">Listings open once the database is connected.</p>;

  const set = (k: string, v: unknown) => { setBiz((b) => ({ ...b, [k]: v })); setDirty(true); };

  async function upload(file: File, bucket: "media" | "private-docs") {
    if (file.size > 5 * 1024 * 1024) throw new Error("File too large (max 5 MB).");
    const { data: who } = await supabase!.auth.getUser();
    if (who.user?.id !== userId) { setSignedOut(true); throw new Error(SIGNED_OUT_MESSAGE); }
    const path = `${userId}/${Date.now()}-${file.name.replace(/[^\w.-]/g, "_")}`;
    const { error } = await supabase!.storage.from(bucket).upload(path, file, { upsert: false });
    if (error) throw new Error(friendlyDbError(error, "this file"));
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

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const then = afterSave.current;
    const publish = publishAfterSave.current;
    afterSave.current = null;
    publishAfterSave.current = false;
    setBusy(true); setMsg(null);
    const fields = fieldsOf(biz);
    // Saved on the server as the member signed in right now, so an expired or switched browser sign-in can't cause a raw database error.
    const res = await saveBusinessListing(fields, { id: biz.id, withExtras: supportsExtras }).catch((err: unknown) => ({ ok: false as const, error: friendlyDbError(err as Error, "your listing"), signedOut: false }));
    setBusy(false);
    if (!res.ok) {
      if (res.signedOut) {
        setSignedOut(true);
        try { localStorage.setItem(draftKey(userId), JSON.stringify(fields)); } catch { /* storage blocked */ }
      }
      setMsg({ ok: false, text: res.error });
      return;
    }
    setSignedOut(false);
    const outcome = res.review?.outcome;
    setBiz((b) => ({ ...b, id: res.id, slug: res.slug,
      ...(outcome === "publish" ? { risk_level: "low", lifecycle_status: "approved", publication_status: "published", published: true } : {}),
      ...(outcome === "hold" ? { risk_level: "needs_review", lifecycle_status: "pending_review", publication_status: "unpublished", published: false } : {}) }));
    setDirty(false);
    const extra = res.partial ? " Logo, hours and links will be saved once FLAME PH finishes a database update." : "";
    // The automatic directory check already ran on save (listing-auto-review): published or held, nothing more to send.
    if (outcome === "publish" || outcome === "hold") {
      setMsg({ ok: true, text: (outcome === "publish"
        ? "Saved and published! Your business is in the FLAME PH business directory now (it can take about a minute to appear)."
        : res.review?.emailNotConfirmed
          ? "Saved. Please confirm your email address (see Account verification), then press Save again to go live."
          : "Saved. Something looked unusual, so a FLAME PH admin will take a quick look before it goes on the directory.") + extra });
      if (then) goTo(then); else router.refresh();
      return;
    }
    setMsg({ ok: true, text: res.partial ? "Saved! Logo, hours and links will be saved once FLAME PH finishes a database update." : then ? "Saved! On to the next step." : "Saved!" });
    const canPublish = publish && completion.complete && submitBotToken && ["draft", "needs_correction", "rejected"].includes(String(biz.lifecycle_status ?? "draft"));
    if (canPublish) return submitForReview(res.id);
    if (publish && !completion.complete) setMsg({ ok: true, text: "Saved! A few items are still needed before your listing can go live: see the list above." });
    if (then) goTo(then); else router.refresh();
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

  async function syncStore() {
    setBusy(true); setMsg(null);
    const res = await syncMarketplaceStore().catch(() => ({ ok: false as const, error: "Could not reach MarketplacePH. Please try again." }));
    setBusy(false);
    if (!res.ok) return setMsg({ ok: false, text: res.error });
    setBiz((b) => ({ ...b, marketplaceph_url: res.url }));
    setMsg({ ok: true, text: `Synced ${res.name}: your store link is in.${res.newPoints ? ` +${res.newPoints} points added to your FLAME PH account.` : ""}` });
    router.refresh();
  }

  async function submitForReview(id = biz.id) {
    if (!id) return;
    setBusy(true); setMsg(null);
    const response = await fetch("/api/business/submit", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ businessId: id, turnstileToken: submitBotToken }),
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
    const live = result?.riskLevel === "low";
    setBiz((current) => ({ ...current, risk_level: live ? "low" : "needs_review", moderation_fields: [],
      lifecycle_status: live ? "approved" : "submitted", publication_status: live ? "published" : "unpublished", published: live }));
    setMsg({ ok: true, text: live
      ? "Published! Your business is now in the FLAME PH directory and on pages.flameph.org/directory (it can take about a minute to appear)."
      : "Sent for a quick FLAME PH check because something looked unusual (for example a business name already listed). We'll publish it once checked." });
    router.refresh();
  }

  const on = (k: SectionKey) => section === k;
  const prev = neighbour(section, -1);
  const next = neighbour(section, 1);
  const stepSection = isStep(section) || section === "publish";
  const needsBasicsFirst = !String(biz.name ?? "").trim() || !String(biz.city ?? "").trim();
  const submittable = ["draft", "needs_correction", "rejected"].includes(String(biz.lifecycle_status ?? "draft"));
  const published = biz.published === true || biz.publication_status === "published";
  const descLen = String(biz.description ?? "").trim().length;
  const storeReady = Boolean(store.linked && store.summary?.activated && store.summary.store);

  return (
    <form id="business-details" onSubmit={save} className={stepSection ? "card mt-4 space-y-4 p-5" : "mt-4 space-y-3"}>
      {biz.risk_level === "high" && <ModerationCorrection business={biz} />}
      {/* Changes typed in a step and not saved yet stay here until saved, even while a Level up page is open. */}
      {!stepSection && dirty && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-warn-soft p-3 text-sm font-semibold text-warn">
          <span>You have listing changes that aren&apos;t saved yet.</span>
          <button className="btn btn-primary min-h-11 px-3 text-sm" disabled={busy}>{busy ? "Saving…" : "Save them now"}</button>
        </div>
      )}
      {!stepSection && msg && <Message msg={msg} signedOut={signedOut} dirty={dirty} userId={userId} fields={() => fieldsOf(biz)} />}

      {on("basics") && <>
        <SectionHead step={1} title="Business basics" help="Only the business name and city are needed to save. Everything else can wait." />
        {FIELDS.filter((f) => f.name === "name").map((f) => <Input key={f.name} f={f} v={biz[f.name]} set={set} />)}
        <div>
          <label className="label" htmlFor="sector">Type of business (sector)</label>
          <select id="sector" className="input" value={String(biz.sector ?? "")} onChange={(e) => set("sector", e.target.value)}>
            <option value="">Pumili…</option>{sectors.map((s) => <option key={s}>{s}</option>)}
          </select>
        </div>
        {FIELDS.filter((f) => f.name === "city").map((f) => <Input key={f.name} f={f} v={biz[f.name]} set={set} />)}
        <div>
          <label className="label" htmlFor="province">Province</label>
          <select id="province" className="input" value={String(biz.province ?? "")} onChange={(e) => set("province", e.target.value)}>
            <option value="">Pumili…</option>{provinces.map((s) => <option key={s}>{s}</option>)}
          </select>
        </div>
      </>}

      {on("about") && <>
        <SectionHead step={2} title="About your business" help="What you offer, who you serve and why customers choose you. Needed to publish: at least 80 characters." />
        <div>
          <label className="label" htmlFor="biz-description">About your business</label>
          <textarea id="biz-description" rows={5} maxLength={3000} className="input" value={String(biz.description ?? "")} onChange={(e) => set("description", e.target.value)} aria-describedby="desc-count" />
          <p id="desc-count" aria-live="polite" className={`mt-1 text-sm font-semibold ${descLen >= DESCRIPTION_MIN ? "text-ok" : "text-warn"}`}>
            {descLen >= DESCRIPTION_MIN ? `✓ ${descLen} characters. Good to publish.` : `${descLen} of ${DESCRIPTION_MIN} characters. Add ${DESCRIPTION_MIN - descLen} more to publish.`}
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <button type="button" className="btn btn-outline min-h-11 px-3 text-sm" onClick={() => set("description", draftDescription(biz, sectors))}>✍️ Help me write it</button>
            <span className="text-sm text-muted">Writes a starter from your name, type of business, city and products. Edit it to sound like you.</span>
          </div>
        </div>
      </>}

      {on("products") && <>
        <SectionHead step={3} title="Products & packages with prices" help="List what you sell. Add each product or package with its price below, so buyers see prices on your listing." />
        <Input f={{ name: "products", label: "Products & services (short list)", textarea: true, help: "Example: Puto, kutsinta, bilao packages for parties" }} v={biz.products} set={set} />
        <p className="rounded-lg bg-bg-soft p-3 text-sm text-muted">Products and packages with prices are added in the box under this step. Each one is saved right away.</p>
      </>}

      {on("contact") && <>
        <SectionHead step={4} title="Contact buttons" help="Add at least one way for customers to reach you. Each one becomes a button on your listing." />
        {FIELDS.filter((f) => f.name.startsWith("contact_")).map((f) => <Input key={f.name} f={f} v={biz[f.name]} set={set} />)}
      </>}

      {on("photos") && <>
        <SectionHead step={5} title="Logo and photos" help="Listings with a logo and 3 or more real photos get more inquiries." />
        {supportsExtras && (
          <div className="grid grid-cols-1 gap-6 sm:flex sm:flex-wrap">
            <ImagePick label="Logo" hint="Square works best." path={biz.logo_url as string | undefined} round onPick={(e) => onSingle(e, "logo_url")} onClear={() => set("logo_url", null)} />
            <ImagePick label="Cover photo" hint="Wide photo of your shop or products." path={biz.cover_url as string | undefined} onPick={(e) => onSingle(e, "cover_url")} onClear={() => set("cover_url", null)} />
          </div>
        )}
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
      </>}

      {on("hours") && <>
        <SectionHead step={6} title="Hours, location and links" help="Tell buyers when you're open, how to find you and where else they can order. This is the last step: Save and publish puts your listing live." />
        {supportsExtras && <>
          <Input f={{ name: "hours", label: "Opening hours", help: "Example: Mon to Sat, 8am to 6pm" }} v={biz.hours} set={set} />
          <Input f={{ name: "map_landmark", label: "Landmark or barangay for directions", help: "Something public like \"near Robinsons Place\" or \"Brgy. San Jose\". Never your home address." }} v={biz.map_landmark} set={set} />
        </>}
        <div className="rounded-xl border border-line p-4">
          <label className="label" htmlFor="biz-marketplaceph_url">Your MarketplacePH store link</label>
          <div className="flex flex-wrap gap-2">
            <input id="biz-marketplaceph_url" type="text" inputMode="url" autoCapitalize="none" spellCheck={false} maxLength={300} placeholder={LINK_PLACEHOLDER.marketplaceph_url}
              className="input min-w-0 flex-1" value={String(biz.marketplaceph_url ?? "")} onChange={(e) => set("marketplaceph_url", e.target.value)} />
            <button type="button" onClick={syncStore} disabled={busy || !storeReady} className="btn btn-primary min-h-11 px-4" aria-describedby="sync-help">↻ Sync</button>
          </div>
          <p id="sync-help" className="mt-2 text-sm text-muted">
            {storeReady
              ? <>Press Sync to bring in your store link from <strong>{store.summary!.store!.name}</strong> on marketplaceph.com, and collect your store points.</>
              : <>The Sync button turns on once your marketplaceph.com account is active: sign in there with your FLAME PH account and open your free store. Then Sync fills in this link for you and adds your store points.</>}
          </p>
          {!storeReady && <a href="https://www.marketplaceph.com/sell/new" target="_blank" rel="noopener" className="mt-1 inline-block text-sm font-bold text-primary underline">Open my free MarketplacePH store ↗</a>}
        </div>
        {supportsExtras && (
          <fieldset className="space-y-4 rounded-xl border border-line p-4"><legend className="px-1 font-bold">Online links</legend>
            <p className="text-sm text-muted">Type your page or shop address any way you like: with or without https://, or just your page name. We turn it into a working link.</p>
            {SOCIALS.map((x) => (
              <div key={x.key}>
                <label className="label" htmlFor={`biz-${x.key}`}>{x.label}</label>
                <input id={`biz-${x.key}`} type="text" inputMode="url" autoCapitalize="none" spellCheck={false} maxLength={300} placeholder={LINK_PLACEHOLDER[x.key]}
                  className="input" value={String(biz[x.key] ?? "")} onChange={(e) => set(x.key, e.target.value)} />
                {linkPreview(x.key, biz[x.key])}
              </div>
            ))}
          </fieldset>
        )}
      </>}

      {on("publish") && <>
        <SectionHead title="Publish status and checks" help="Your listing publishes automatically when you save step 6 with everything below ticked. Only listings that look confusing, unreadable, not business-related or scam-like go to a quick FLAME PH check. Publication is controlled by FLAME PH, which can still hide or remove listings that break the member rules." />
        <BusinessStatus business={biz} />
        <ListingStrength biz={biz} supportsExtras={supportsExtras} />
        <NeededToPublish completion={completion} goTo={goTo} ownerName={ownerName} />
        <fieldset className="rounded-xl border border-line p-4">
          <legend className="px-1 font-bold">Get a Verified badge (optional)</legend>
          <p className="text-sm text-muted">Optional evidence may include DTI, SEC, CDA, BMBE, Mayor&apos;s/Business Permit or BIR documents. Send them in Business vetting: they are encrypted, and only FLAME PH reviewers can open them.</p>
          <p className="mt-2 text-sm font-semibold">Status: {biz.verified ? "✓ Verified" : biz.verification_status === "pending" ? "Pending review" : biz.verification_status === "rejected" ? "Not approved. Please upload clearer documents." : "Not submitted"}</p>
          {!biz.verified && <Link href="/account/vetting" className="btn btn-outline mt-2 min-h-11">Open Business vetting</Link>}
        </fieldset>
      </>}

      {/* The email check is needed before anything can publish: shown on step 6 and on the status page when it isn't done. */}
      {(on("hours") || on("publish")) && !verification.email_verified && (
        <fieldset className="rounded-xl border border-gold/50 bg-warn-soft p-4">
          <legend className="px-1 font-bold">Verify your email to publish</legend>
          <div className="space-y-2 text-sm">
            <Turnstile action="auth" onToken={setEmailBotToken} resetKey={emailBotReset} />
            <button type="button" onClick={sendVerificationEmail} disabled={busy || !emailBotToken} className="btn btn-outline">Send verification email</button>
            {verification.mobile_required && !verification.sms_provider_configured && <p className="text-warn">SMS verification is not configured yet. FLAME PH must configure a provider before making mobile verification mandatory.</p>}
          </div>
        </fieldset>
      )}

      {stepSection && <>
        {(on("hours") || on("publish")) && !published && submittable && (
          <div className="rounded-xl bg-bg-soft p-3 text-sm">
            {completion.complete
              ? <p className="font-semibold text-ok">✓ Everything needed to publish is in. Save and publish puts your listing live right away.</p>
              : <NeededToPublish completion={completion} goTo={goTo} ownerName={ownerName} compact />}
            {/* Bot check for the automatic publish: usually passes by itself without the member doing anything. */}
            {completion.complete && <div className="mt-2"><Turnstile action="business_submit" onToken={setSubmitBotToken} resetKey={submitBotReset} /></div>}
          </div>
        )}
        {stepSection && msg && <Message msg={msg} signedOut={signedOut} dirty={dirty} userId={userId} fields={() => fieldsOf(biz)} />}
        {needsBasicsFirst && !on("basics") && (
          <p className="rounded-lg bg-bg-soft p-3 text-sm">To save, first add your <button type="button" onClick={() => goTo("basics")} className="font-bold text-primary underline">business name and city in step 1</button>.</p>
        )}
        <div className="flex flex-wrap items-center gap-2 border-t border-line pt-4">
          {prev && <button type="button" onClick={() => goTo(prev)} className="btn btn-ghost px-3">← Back</button>}
          {next && <button type="button" onClick={() => goTo(next)} className="btn btn-ghost ml-auto px-3 text-muted">Skip for now</button>}
          {on("publish") || on("hours") ? (
            <button className={`btn btn-flame ${next ? "" : "ml-auto"}`} disabled={busy || needsBasicsFirst} onClick={() => { afterSave.current = null; publishAfterSave.current = true; }}>
              {busy ? "Saving…" : published || !submittable ? "Save" : "Save and publish"}
            </button>
          ) : (
            <button className={`btn btn-primary ${next ? "" : "ml-auto"}`} disabled={busy || needsBasicsFirst} onClick={() => { afterSave.current = next; publishAfterSave.current = false; }}>
              {busy ? "Saving…" : "Save and continue"}
            </button>
          )}
        </div>
        {biz.id && (
          <div className="flex flex-wrap gap-2 text-sm">
            <Link href="/account/business/preview" className="font-semibold text-primary underline">Preview my listing</Link>
            {biz.slug && published && <Link href={`/directory/${biz.slug}`} className="font-semibold text-primary underline">View public page</Link>}
          </div>
        )}
      </>}
    </form>
  );
}

/** The items needed to publish, in the form's own words, each linked to the step where it is filled in. */
function NeededToPublish({ completion, goTo, ownerName, compact }: { completion: ReturnType<typeof businessCompletion>; goTo: (k: SectionKey) => void; ownerName: string; compact?: boolean }) {
  const list = compact ? completion.missing : completion.checks;
  return (
    <fieldset className={compact ? "" : "rounded-xl border border-line p-4"}>
      <legend className={compact ? "font-bold" : "px-1 font-bold"}>{compact ? "Still needed to publish" : "Needed to publish"}</legend>
      <ul className="mt-1 space-y-2 text-sm">
        {list.map((check) => (
          <li key={check.key} className="flex gap-2">
            <span aria-hidden className={check.done ? "text-ok" : "text-muted"}>{check.done ? "✓" : "○"}</span>
            <span>
              <strong>{check.label}</strong>
              {!check.done && <> — <span className="text-muted">{check.help}</span>{" "}
                {check.step === "profile"
                  ? <Link href="/account/profile" className="font-bold text-primary underline">Open My profile</Link>
                  : <button type="button" onClick={() => goTo(check.step as SectionKey)} className="font-bold text-primary underline">Go there</button>}
              </>}
            </span>
          </li>
        ))}
      </ul>
      {!compact && !ownerName.trim() && <p className="mt-3 text-sm"><Link href="/account/profile" className="font-bold underline">Complete your member profile</Link> to identify the owner or authorized representative.</p>}
      {!compact && <p className="mt-3 text-sm text-muted">Formal registration documents are optional. Aspiring entrepreneurs, home-based sellers, informal microbusinesses and startups can publish once the essentials above are complete.</p>}
    </fieldset>
  );
}

/** Shows where a typed link will go, so members can see it works before saving. */
function linkPreview(kind: LinkKind, v: unknown) {
  if (typeof v !== "string" || !v.trim()) return null;
  const u = normalizeLink(kind, v);
  return u
    ? <p className="mt-1 break-all text-xs text-ok">✓ Opens <a href={u} target="_blank" rel="noopener" className="underline">{u}</a></p>
    : <p className="mt-1 text-xs font-semibold text-warn">That doesn&apos;t look like a web link yet. Example: {LINK_PLACEHOLDER[kind]}</p>;
}

/** A starter description from what the member already typed. Never invents facts: it only reuses their own entries. */
function draftDescription(b: Biz, sectors: string[]) {
  const t = (k: string) => String(b[k] ?? "").trim();
  const name = t("name") || "We";
  const sector = sectors.includes(t("sector")) ? t("sector").toLowerCase() : "";
  const place = [t("city"), t("province")].filter(Boolean).join(", ");
  const products = t("products").split(/\n|,/).map((x) => x.trim()).filter(Boolean).slice(0, 6).join(", ");
  const current = t("description");
  return [
    `${name} is a ${sector ? `${sector} business` : "local business"}${place ? ` in ${place}` : ""}.`,
    current && !current.startsWith(name) ? (/[.!?]$/.test(current) ? current : `${current}.`) : "",
    products ? `We offer ${products}.` : "We offer [what you sell or the service you provide].",
    "We serve [who your customers are, for example families, offices, resellers or restaurants].",
    "Message us for prices, orders and delivery.",
  ].filter(Boolean).join(" ");
}

/** Section title and a one-line hint, at the top of each section of the form. */
function SectionHead({ step, title, help }: { step?: number; title: string; help: string }) {
  return (
    <div>
      {step && <p className="text-xs font-bold uppercase tracking-wide text-flame-strong">Step {step} of 6</p>}
      <h2 className="text-xl font-bold">{title}</h2>
      <p className="mt-1 text-sm text-muted">{help}</p>
    </div>
  );
}

function Message({ msg, signedOut, dirty, userId, fields }: { msg: { ok: boolean; text: string }; signedOut: boolean; dirty: boolean; userId: string; fields: () => Record<string, unknown> }) {
  return (
    <p role="status" className={`rounded-lg p-3 font-semibold ${msg.ok ? "bg-ok-soft text-ok" : "bg-red-50 text-red-800 dark:bg-red-950 dark:text-red-200"}`}>
      {msg.text}
      {signedOut && !msg.ok && <> <a className="underline" href="/login?next=%2Faccount%2Fbusiness" onClick={() => { try { if (dirty) localStorage.setItem(draftKey(userId), JSON.stringify(fields())); } catch { /* storage blocked */ } }}>Log in again</a></>}
    </p>
  );
}

function ModerationCorrection({ business }: { business: Biz }) {
  const fields = safeModerationFields(business.moderation_fields);
  return (
    <section className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-amber-950 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-100" aria-labelledby="moderation-correction-title">
      <h2 id="moderation-correction-title" className="font-bold">Business Information Needs Correction</h2>
      <p className="mt-1 text-sm">This listing is not currently shown in the FLAME PH directory. Some information needs correction before it can be published.</p>
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
