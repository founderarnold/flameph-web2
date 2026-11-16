import Link from "next/link";
import type { SupabaseClient } from "@supabase/supabase-js";
import { list } from "@/lib/content";
import { subsOf } from "@/lib/industries";
import { regionOf } from "@/content/ph-regions";
import { REGISTRATION_VISIBILITY } from "@/lib/privacy";
import { saveBusinessDetails } from "@/app/account/onboarding-actions";
import { SubmitButton } from "@/components/SubmitButton";
import { Notice } from "@/components/ui";

type Biz = { id: string; sector?: string | null; subsector?: string | null; chapter_id?: string | null; province?: string | null };
type Chapter = { id: string; name: string; province: string | null; status: string };

const REG_FIELDS = [
  { name: "dti_bn", label: "DTI business name number" },
  { name: "sec_reg", label: "SEC registration number" },
  { name: "cda_reg", label: "CDA registration number (cooperatives)" },
  { name: "bmbe_cert", label: "BMBE certificate number" },
  { name: "mayors_permit", label: "Mayor's or business permit number" },
] as const;

/** Extra business profile fields: specific industry, region (automatic), chapter and optional registration numbers. */
export async function BusinessDetails({ supabase, biz, status }: { supabase: SupabaseClient; biz: Biz; status?: string }) {
  const [chapters, { data: reg }] = await Promise.all([
    list<Chapter>({ table: "chapters", order: "name", ascending: true }),
    supabase.from("business_registrations").select("*").eq("business_id", biz.id).maybeSingle(),
  ]);
  const ready = "subsector" in biz; // false until the 0016 database update is run
  const subs = subsOf(biz.sector);
  const region = regionOf(biz.province);
  return (
    <section id="details" aria-labelledby="details-h" className="card mt-6 scroll-mt-24 space-y-4 p-5">
      <div>
        <h2 id="details-h" className="text-xl font-bold">More business details</h2>
        <p className="text-sm text-muted">These help the right members and buyers find you. Registration numbers are optional.</p>
      </div>
      {status === "saved" && <div role="status"><Notice tone="ok">Details saved.</Notice></div>}
      {status === "error" && <Notice tone="danger">Some details didn&apos;t save. Please try again.</Notice>}
      {!ready ? (
        <Notice tone="info">These fields open after FLAME PH finishes a database update.</Notice>
      ) : (
        <form action={saveBusinessDetails} className="space-y-4">
          <div>
            <label className="label" htmlFor="bd-sub">Specific industry</label>
            {subs.length ? (
              <select id="bd-sub" name="subsector" defaultValue={biz.subsector ?? ""} className="input">
                <option value="">Choose…</option>{subs.map((x) => <option key={x}>{x}</option>)}
              </select>
            ) : <p className="text-sm text-muted">{biz.sector ? "No more specific choices for this sector." : "Choose your sector above and save first."}</p>}
            {biz.sector && <p className="mt-1 text-sm text-muted">Sector: {biz.sector}</p>}
          </div>
          <div>
            <p className="label">Region</p>
            <p className="text-[15px]">{region ?? <span className="text-muted">Choose your province above; the region is filled in for you.</span>}</p>
          </div>
          <div>
            <label className="label" htmlFor="bd-ch">Chapter</label>
            <select id="bd-ch" name="chapter_id" defaultValue={biz.chapter_id ?? ""} className="input">
              <option value="">No chapter</option>
              {chapters.filter((c) => c.status !== "inactive").map((c) => <option key={c.id} value={c.id}>{c.name}{c.province ? ` (${c.province})` : ""}</option>)}
            </select>
            <p className="mt-1 text-sm text-muted"><Link href="/chapters" className="underline">See all chapters</Link></p>
          </div>
          <fieldset className="space-y-3">
            <legend className="font-bold">Registration numbers (optional)</legend>
            {REG_FIELDS.map((f) => (
              <div key={f.name}><label className="label" htmlFor={`bd-${f.name}`}>{f.label}</label>
                <input id={`bd-${f.name}`} name={f.name} maxLength={40} defaultValue={(reg?.[f.name] as string | null) ?? ""} className="input" /></div>
            ))}
            <div><label className="label" htmlFor="bd-tin">BIR TIN</label>
              <input id="bd-tin" name="bir_tin" maxLength={20} inputMode="numeric" defaultValue={reg?.bir_tin ?? ""} className="input" />
              <p className="mt-1 text-sm text-muted">Your TIN is never shown to anyone. Only you and the FLAME PH team can see it.</p></div>
            <div><label className="label" htmlFor="bd-vis">Who can see your registration numbers (except TIN)?</label>
              <select id="bd-vis" name="reg_visibility" defaultValue={reg?.visibility ?? "private"} className="input">
                {REGISTRATION_VISIBILITY.map((v) => <option key={v.value} value={v.value}>{v.label}</option>)}
              </select></div>
          </fieldset>
          <SubmitButton className="btn btn-primary">Save details</SubmitButton>
          <p className="text-sm text-muted">Choose who sees your phone, email and links in <Link href="/account/settings#privacy" className="underline">Settings → Privacy</Link>.</p>
        </form>
      )}
    </section>
  );
}
