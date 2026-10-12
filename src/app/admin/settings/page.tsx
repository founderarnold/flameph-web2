import { adminContext } from "@/lib/admin/guard";
import { saveSettings } from "../actions";
import { DEFAULT_SETTINGS, type Settings } from "@/lib/settings";
import { Notice } from "@/components/ui";

export default async function SettingsPage({ searchParams }: { searchParams: Promise<{ saved?: string }> }) {
  const sp = await searchParams;
  const { db } = await adminContext(["super_admin", "admin"]);
  const { data } = await db.from("settings").select("key,value");
  const s: Settings = { ...DEFAULT_SETTINGS, ...Object.fromEntries((data ?? []).map((r) => [r.key, r.value])) };
  const n = (label: string, name: string, v: number | undefined) => <div><label className="label" htmlFor={name}>{label}</label><input id={name} name={name} type="number" min={0} step="any" defaultValue={v ?? ""} className="input" /></div>;
  const t = (label: string, name: string, v?: string | null, type = "text") => <div><label className="label" htmlFor={name}>{label}</label><input id={name} name={name} type={type} defaultValue={v ?? ""} className="input" /></div>;
  return (
    <div className="max-w-2xl space-y-4">
      <h1 className="text-2xl font-extrabold text-primary">Settings</h1>
      {sp.saved && <Notice tone="ok">Settings saved. The public site updates within 5 minutes.</Notice>}
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
        </fieldset>
        <fieldset className="card space-y-3 p-5"><legend className="px-1 font-bold">Verified donation details (shown on Poverty Alleviation page)</legend>
          <p className="text-sm text-muted">Only enter official accounts in FLAME PH&apos;s registered name. Leave empty to show “not accepting online donations yet”.</p>
          {t("Bank", "don_bank", s.donation_details?.bank)}{t("Account name", "don_account_name", s.donation_details?.account_name)}{t("Account number", "don_account_no", s.donation_details?.account_no)}{t("GCash number", "don_gcash", s.donation_details?.gcash)}{t("Receipts process note", "don_receipts", s.donation_details?.receipts_note)}
        </fieldset>
        <fieldset className="card space-y-2 p-5"><legend className="px-1 font-bold">Legal documents approved by a founder</legend>
          {(["terms", "privacy", "membership"] as const).map((k) => (
            <label key={k} className="flex items-center gap-2"><input type="checkbox" name={`legal_${k}`} defaultChecked={s.legal_status?.[k] === "approved"} className="h-5 w-5" />{k === "terms" ? "Terms of Use" : k === "privacy" ? "Privacy Notice" : "Membership Terms"} approved (removes the “Draft” banner)</label>
          ))}
        </fieldset>
        <button className="btn btn-primary">Save settings</button>
      </form>
    </div>
  );
}
