import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { saveProfile } from "../actions";
import { StagePicker } from "@/components/StagePicker";
import { PROVINCES } from "@/content/ph-provinces";
import { saveMemberType, saveRegistration, removeRegistration } from "../investor-actions";
import { InvestorWarning } from "@/components/feed/InvestorWarning";
import { Notice } from "@/components/ui";
import { INVESTOR_ERRORS, MEMBER_TYPES, REGISTRATION_LABEL_MEANING, REGISTRATION_LABEL_MEANING_TL, REGULATORS, registrationLabel, type MemberType, type Regulator } from "@/lib/investor";

const INVESTOR_DONE: Record<string, string> = {
  type: "Profile type saved. It applies to posts you make from now on.",
  registration: "Registration sent. A FLAME PH admin will look for it on the regulator's public list.",
  removed: "Registration removed. The label is no longer shown.",
};

export default async function Profile({ searchParams }: { searchParams: Promise<{ welcome?: string; error?: string; investor_error?: string; investor_done?: string }> }) {
  const { supabase, user } = await requireUser("/account/profile");
  const sp = await searchParams;
  const { data: p } = await supabase.from("profiles").select("*").eq("id", user.id).single();
  // Before the 0026 update the column is missing and everyone is a business owner.
  const typeAvailable = Boolean(p && "member_type" in p);
  const memberType = (p?.member_type ?? "business") as MemberType;
  const investor = memberType === "investor_funder";
  const { data: reg } = investor ? await supabase.from("investor_registrations").select("regulator, registered_name, reg_number, status, checked_at").eq("user_id", user.id).maybeSingle() : { data: null };
  const label = reg?.status === "seen" ? registrationLabel({ regulator: reg.regulator as Regulator, checked_at: reg.checked_at }) : null;
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
        <p className="text-sm text-muted">Newsletter and privacy choices are now in <Link className="text-mph underline" href="/account/settings">Settings</Link>.</p>
        <p className="text-sm text-muted">Signed in as {user.email}</p>
        <button className="btn btn-primary">Save profile</button>
      </form>

      <section id="profile-type" aria-labelledby="profile-type-h" className="card mt-6 scroll-mt-24 space-y-4 p-5">
        <h2 id="profile-type-h" className="text-lg font-extrabold">Profile type</h2>
        {sp.investor_done && INVESTOR_DONE[sp.investor_done] && <div role="status"><Notice tone="ok">{INVESTOR_DONE[sp.investor_done]}</Notice></div>}
        {sp.investor_error && <p role="alert" className="rounded-xl bg-danger-soft p-3 text-sm font-semibold text-danger">{INVESTOR_ERRORS[sp.investor_error] ?? INVESTOR_ERRORS.failed}</p>}
        {!typeAvailable ? <p className="text-sm text-muted">{INVESTOR_ERRORS.unavailable}</p> : (
          <form action={saveMemberType} className="space-y-3">
            <fieldset className="grid gap-2">
              <legend className="sr-only">Profile type</legend>
              {(Object.keys(MEMBER_TYPES) as MemberType[]).map((t) => (
                <label key={t} className="flex min-h-11 cursor-pointer items-start gap-2 rounded-xl border border-line px-3 py-2 has-[:checked]:border-primary has-[:checked]:bg-primary-soft">
                  <input type="radio" name="member_type" value={t} defaultChecked={memberType === t} className="mt-1 size-4" />
                  <span><span className="block font-semibold">{MEMBER_TYPES[t].label}</span><span className="block text-xs text-muted">{MEMBER_TYPES[t].help}</span></span>
                </label>
              ))}
            </fieldset>
            <p className="text-sm text-muted">Investors and funders get the label &quot;Investor or funder&quot; on their name. Every post they make, and every reply under it, shows this warning. It can&apos;t be removed or hidden:</p>
            <InvestorWarning compact />
            <p className="text-sm text-muted">FLAME PH has no way to pledge, invest, pay, subscribe or commit money to anyone. Any deal happens outside FLAME PH.</p>
            <button className="btn btn-primary min-h-11">Save profile type</button>
          </form>
        )}
      </section>

      {investor && (
        <section id="registration" aria-labelledby="registration-h" className="card mt-6 scroll-mt-24 space-y-4 p-5">
          <h2 id="registration-h" className="text-lg font-extrabold">Registration or licence (optional)</h2>
          <p className="text-sm text-muted">If you are registered or licensed with a regulator, tell us the name and number. Only you and FLAME PH admins can see them. An admin looks for them on the regulator&apos;s public list.</p>
          {label && <p className="text-sm"><span className="rounded-full bg-bg-soft px-2 py-0.5 font-semibold">{label}</span></p>}
          {reg?.status === "submitted" && <p className="text-sm text-muted">Waiting for an admin to check.</p>}
          {reg?.status === "not_found" && <p className="text-sm text-muted">An admin could not find this on the regulator&apos;s public list, so no label is shown. Check the details and send them again.</p>}
          <div className="rounded-xl bg-bg-soft p-3 text-sm">
            <p className="font-semibold">What the label means</p>
            <p className="mt-1">{REGISTRATION_LABEL_MEANING}</p>
            <p className="mt-1" lang="fil">{REGISTRATION_LABEL_MEANING_TL}</p>
          </div>
          <form action={saveRegistration} className="space-y-3">
            <div>
              <label className="label" htmlFor="rg">Regulator</label>
              <select id="rg" name="regulator" required defaultValue={reg?.regulator ?? ""} className="input">
                <option value="" disabled>Choose…</option>
                {(Object.keys(REGULATORS) as Regulator[]).map((r) => <option key={r} value={r}>{REGULATORS[r]}</option>)}
              </select>
            </div>
            <div><label className="label" htmlFor="rn">Registered name (as on the certificate)</label><input id="rn" name="registered_name" required minLength={2} maxLength={160} defaultValue={reg?.registered_name ?? ""} className="input" /></div>
            <div><label className="label" htmlFor="rno">Registration or licence number</label><input id="rno" name="reg_number" required minLength={2} maxLength={60} defaultValue={reg?.reg_number ?? ""} className="input" /></div>
            <p className="text-xs text-muted">Changing these clears an earlier check.</p>
            <button className="btn btn-primary min-h-11">{reg ? "Send again" : "Send for checking"}</button>
          </form>
          {reg && <form action={removeRegistration}><button className="btn btn-outline min-h-11">Remove my registration</button></form>}
        </section>
      )}
    </div>
  );
}
