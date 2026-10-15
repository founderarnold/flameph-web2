import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { saveProfile } from "../actions";
import { Notice } from "@/components/ui";
import { StagePicker } from "@/components/StagePicker";
import { PROVINCES } from "@/content/ph-provinces";

export default async function Profile({ searchParams }: { searchParams: Promise<{ welcome?: string; error?: string }> }) {
  const { supabase, user } = await requireUser("/account/profile");
  const sp = await searchParams;
  const { data: p } = await supabase.from("profiles").select("*").eq("id", user.id).single();
  return (
    <div className="max-w-xl">
      <h1 className="text-3xl font-extrabold text-primary">{sp.welcome ? "Maligayang pagdating!" : "My profile"}</h1>
      {sp.welcome && <p className="mt-2 text-muted">Tell us a bit about you so we can send the right resources and events.</p>}
      {sp.welcome && !p?.business_stage && (
        <div className="card mt-6 p-5">
          <h2 className="text-lg font-extrabold">Nasaan na ang negosyo mo?</h2>
          <p className="mt-1 text-sm text-muted">One tap. You can change it anytime below.</p>
          <StagePicker back="/account/profile?welcome=1" narrow />
        </div>
      )}
      {sp.error === "consent" && <div className="mt-4"><Notice>Please agree to the Privacy Notice to save your profile.</Notice></div>}
      <form action={saveProfile} className="card mt-6 space-y-4 p-5">
        <div><label className="label" htmlFor="fn">Full name *</label><input id="fn" name="full_name" required defaultValue={p?.full_name ?? ""} autoComplete="name" className="input" /></div>
        <div><label className="label" htmlFor="mb">Mobile number</label><input id="mb" name="mobile" type="tel" inputMode="tel" defaultValue={p?.mobile ?? ""} placeholder="09XX XXX XXXX" className="input" /></div>
        <div>
          <label className="label" htmlFor="pv">Province *</label>
          <select id="pv" name="province" required defaultValue={p?.province ?? ""} className="input">
            <option value="" disabled>Pumili…</option>{PROVINCES.map((x) => <option key={x}>{x}</option>)}
          </select>
        </div>
        <div><label className="label" htmlFor="ct">City / Municipality *</label><input id="ct" name="city" required defaultValue={p?.city ?? ""} className="input" /></div>
        <div>
          <label className="label" htmlFor="st">Business stage</label>
          <select id="st" name="business_stage" defaultValue={p?.business_stage ?? ""} className="input">
            <option value="">Pumili…</option>
            <option value="discover">Discover: may idea pa lang</option>
            <option value="start">Start: bagong negosyo</option>
            <option value="build">Build: inaayos ang sistema</option>
            <option value="grow">Grow: dumarami ang customers</option>
            <option value="scale">Scale: lalawak na</option>
          </select>
        </div>
        <label className="flex items-start gap-2"><input type="checkbox" name="consent_privacy" value="yes" required defaultChecked={p?.consent_privacy} className="mt-1 h-5 w-5 shrink-0" /><span>I agree to the <Link className="underline" href="/legal/privacy">Privacy Notice</Link> and the processing of my data under RA 10173. *</span></label>
        <label className="flex items-start gap-2"><input type="checkbox" name="consent_marketing" value="yes" defaultChecked={p?.consent_marketing} className="mt-1 h-5 w-5 shrink-0" /><span>Send me the MSME Bulletin and event updates.</span></label>
        <p className="text-sm text-muted">Signed in as {user.email}</p>
        <button className="btn btn-primary">Save profile</button>
      </form>
    </div>
  );
}
