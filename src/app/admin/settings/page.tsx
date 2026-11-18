import { POLICY_VERSION } from "@/lib/policy";
import { adminContext } from "@/lib/admin/guard";
import { saveEcosystemSwitches, saveSettings } from "../actions";
import { DEFAULT_SETTINGS, type Settings } from "@/lib/settings";
import { Notice } from "@/components/ui";

export default async function SettingsPage({ searchParams }: { searchParams: Promise<{ saved?: string; switches?: string }> }) {
  const sp = await searchParams;
  const { db } = await adminContext(["super_admin", "admin"]);
  const { data } = await db.from("settings").select("key,value");
  const s: Settings = { ...DEFAULT_SETTINGS, ...Object.fromEntries((data ?? []).map((r) => [r.key, r.value])) };
  const n = (label: string, name: string, v: number | undefined) => <div><label className="label" htmlFor={name}>{label}</label><input id={name} name={name} type="number" min={0} step="any" defaultValue={v ?? ""} className="input" /></div>;
  const t = (label: string, name: string, v?: string | null, type = "text") => <div><label className="label" htmlFor={name}>{label}</label><input id={name} name={name} type={type} defaultValue={v ?? ""} className="input" /></div>;
  const eco = ((data ?? []).find((r) => r.key === "ecosystem")?.value ?? {}) as { badges?: boolean; sso?: boolean };
  return (
    <div className="max-w-2xl space-y-4">
      <h1 className="text-2xl font-extrabold text-primary">Settings</h1>
      {sp.saved && <Notice tone="ok">Settings saved. The public site updates within 5 minutes.</Notice>}
      {sp.switches && <Notice tone="ok">Switches saved. They take effect within a minute; badges leave the other sites within 10 minutes.</Notice>}
      <form action={saveEcosystemSwitches} className="card space-y-3 p-5" aria-labelledby="eco-switches">
        <h2 id="eco-switches" className="font-bold">Ecosystem off switches (MarketplacePH and NegosyoDepot)</h2>
        <p className="text-sm text-muted">Use these if something goes wrong. No new version of the website is needed. Every change is written to the audit log.</p>
        <label className="flex items-start gap-3"><input type="checkbox" name="sso" defaultChecked={eco.sso !== false} className="mt-1 h-5 w-5" />
          <span><strong>Sign in with FLAME PH on the other sites.</strong> <span className="text-sm text-muted">Off: MarketplacePH uses only its own sign-in, NegosyoDepot&apos;s member area pauses, and members already signed in there are signed out within 5 minutes.</span></span></label>
        <label className="flex items-start gap-3"><input type="checkbox" name="badges" defaultChecked={eco.badges === true} className="mt-1 h-5 w-5" />
          <span><strong>Badges on the other sites (consent 3).</strong> <span className="text-sm text-muted">Off: no badge is shared with anyone, and both sites drop all badges within 10 minutes. The flameph.org badge is not affected.</span></span></label>
        <button className="btn btn-primary">Save switches</button>
      </form>
      <form action={saveSettings} className="space-y-6">
        <fieldset className="card space-y-3 p-5"><legend className="px-1 font-bold">Official social media (leave empty to hide)</legend>
          {["facebook", "messenger", "tiktok", "youtube", "instagram", "linkedin", "x"].map((k) => t(k === "messenger" ? "Messenger (m.me link, used for merch inquiries)" : k[0].toUpperCase() + k.slice(1), `social_${k}`, s.social_links?.[k], "url"))}
        </fieldset>
        <fieldset className="card space-y-3 p-5"><legend className="px-1 font-bold">Statistics display</legend>
          {n("Show “Be one of our founding members” while members are below", "founding_members", s.stat_thresholds?.founding_members)}
          {n("Show AI helpful rate after this many ratings", "ai_helpful_min_ratings", s.stat_thresholds?.ai_helpful_min_ratings)}
          {t("Platform launch date", "launch_date", s.launch_date, "date")}
        </fieldset>
        <fieldset className="card grid gap-3 p-5 sm:grid-cols-2"><legend className="px-1 font-bold">Ka-FLAME AI daily question limits</legend>
          {(["guest", "free", "starter", "micro", "neo", "pro", "champion"] as const).map((k) => n(k[0].toUpperCase() + k.slice(1), `ai_${k}`, s.ai_limits?.[k]))}
          <div className="sm:col-span-2">{n("Monthly spend cap in USD (0 = no cap)", "ai_cap", s.ai_monthly_cap_usd)}</div>
          <div className="sm:col-span-2">{n("Most one member can use per month, in USD (0 = no per-member limit)", "ai_member_cap", s.ai_member_monthly_cap_usd ?? 2)}</div>
        </fieldset>
        <fieldset className="card space-y-3 p-5"><legend className="px-1 font-bold">Verified donation details (shown on Poverty Alleviation page)</legend>
          <p className="text-sm text-muted">Only enter official accounts in FLAME PH&apos;s registered name. Leave empty to show “not accepting online donations yet”.</p>
          {t("Bank", "don_bank", s.donation_details?.bank)}{t("Account name", "don_account_name", s.donation_details?.account_name)}{t("Account number", "don_account_no", s.donation_details?.account_no)}{t("GCash number", "don_gcash", s.donation_details?.gcash)}{t("Receipts process note", "don_receipts", s.donation_details?.receipts_note)}
        </fieldset>
        <fieldset className="card space-y-2 p-5"><legend className="px-1 font-bold">Legal documents</legend>
          <p className="text-sm text-muted">The Terms of Use, Community Guidelines and Privacy Notice are live as version {POLICY_VERSION}. A new version is published through a code change (src/lib/policy.ts), and members are asked to accept it on their next sign-in.</p>
          {(["terms", "privacy", "membership"] as const).map((k) => <input key={k} type="hidden" name={`legal_${k}`} value="on" />)}
        </fieldset>
        <button className="btn btn-primary">Save settings</button>
      </form>
    </div>
  );
}
