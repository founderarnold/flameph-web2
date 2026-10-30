import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { EmptyState } from "@/components/ui";
import { setInquiryStatus } from "../actions";

type Inquiry = { id: string; name: string; email: string | null; mobile: string | null; message: string; product_name: string | null; status: string; created_at: string };

const STATUS: Record<string, { label: string; cls: string }> = {
  new: { label: "New", cls: "bg-flame-soft text-flame-strong" },
  read: { label: "Read", cls: "bg-primary-soft text-primary" },
  replied: { label: "Replied", cls: "bg-ok-soft text-ok" },
  archived: { label: "Archived", cls: "bg-bg-soft text-muted" },
};

export default async function Inquiries({ searchParams }: { searchParams: Promise<{ show?: string }> }) {
  const { supabase, user } = await requireUser("/account/inquiries");
  const sp = await searchParams;
  const showArchived = sp.show === "archived";
  const [{ data: biz }, { data, error }] = await Promise.all([
    supabase.from("businesses").select("id, name, slug, published").eq("owner_id", user.id).limit(1).maybeSingle(),
    supabase.from("business_inquiries").select("*").eq("owner_id", user.id).order("created_at", { ascending: false }).limit(200),
  ]);
  const { data: stats } = biz
    ? await supabase.from("business_stats").select("views, clicks").eq("business_id", biz.id).gte("day", new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10))
    : { data: [] };
  const all = (data ?? []) as Inquiry[];
  const rows = all.filter((x) => (showArchived ? x.status === "archived" : x.status !== "archived"));
  const views = (stats ?? []).reduce((n, x) => n + (x.views ?? 0), 0);
  const clicks = (stats ?? []).reduce((n, x) => n + (x.clicks ?? 0), 0);
  const last30 = all.filter((x) => Date.now() - new Date(x.created_at).getTime() < 30 * 86400000).length;

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h1 className="text-3xl font-extrabold text-primary">Inquiries</h1>
        <p className="mt-2 text-muted">Messages buyers send from your listing&apos;s inquiry form. We also email them to you when email is set up.</p>
      </div>
      <dl className="grid grid-cols-3 gap-3">
        {[{ k: "Listing views", v: views }, { k: "Contact taps", v: clicks }, { k: "Inquiries", v: last30 }].map((x) => (
          <div key={x.k} className="card p-4"><dt className="text-sm text-muted">{x.k}</dt><dd className="font-display text-2xl font-extrabold tabular-nums text-primary">{x.v}</dd><p className="text-xs text-muted">last 30 days</p></div>
        ))}
      </dl>
      {error ? (
        <EmptyState title="Inquiries are almost ready." text="FLAME PH is finishing a database update. Buyers can still reach you with your contact buttons." />
      ) : !biz ? (
        <EmptyState title="List your business to start getting inquiries." cta={{ href: "/account/business", label: "List my business free" }} />
      ) : (
        <>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm text-muted">{biz.published ? <>Buyers can find businesses in the <Link className="font-semibold text-mph underline" href="https://pages.flameph.org/directory">Pages directory</Link>.</> : <>Your listing is hidden. <Link className="font-semibold text-mph underline" href="/account/business">Publish it</Link> so buyers can reach you.</>}</p>
            <Link href={showArchived ? "/account/inquiries" : "/account/inquiries?show=archived"} className="text-sm font-semibold text-mph underline">{showArchived ? "Back to inbox" : "See archived"}</Link>
          </div>
          {rows.length === 0 ? (
            <EmptyState title={showArchived ? "Nothing archived." : "No inquiries yet."} text={showArchived ? undefined : "Add photos and products with prices so buyers have a reason to ask. Share your listing on Facebook and Viber."} cta={showArchived ? undefined : { href: "/account/business", label: "Improve my listing" }} />
          ) : (
            <ul className="space-y-3">
              {rows.map((q) => {
                const st = STATUS[q.status] ?? STATUS.new;
                const phone = q.mobile?.replace(/\s/g, "");
                return (
                  <li key={q.id} className={`card p-4 ${q.status === "new" ? "border-flame" : ""}`}>
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-bold">{q.name}</p>
                      <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${st.cls}`}>{st.label}</span>
                      <span className="text-sm text-muted">{new Date(q.created_at).toLocaleString("en-PH", { timeZone: "Asia/Manila", dateStyle: "medium", timeStyle: "short" })}</span>
                    </div>
                    {q.product_name && <p className="mt-1 text-sm font-semibold text-flame-strong">About: {q.product_name}</p>}
                    <p className="mt-2 whitespace-pre-line">{q.message}</p>
                    <p className="mt-2 text-sm text-muted">{[q.email, q.mobile].filter(Boolean).join(" · ")}</p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {q.email && <a className="btn btn-primary min-h-9 px-3 text-sm" href={`mailto:${q.email}?subject=${encodeURIComponent(`Re: your inquiry to ${biz.name}`)}`}>Reply by email</a>}
                      {phone && <a className="btn btn-outline min-h-9 px-3 text-sm" href={`viber://chat?number=${encodeURIComponent(phone.replace(/^0/, "+63"))}`}>Viber</a>}
                      {phone && <a className="btn btn-outline min-h-9 px-3 text-sm" href={`sms:${phone}`}>Text</a>}
                      {["read", "replied", "archived"].filter((x) => x !== q.status).map((x) => (
                        <form key={x} action={setInquiryStatus}>
                          <input type="hidden" name="id" value={q.id} /><input type="hidden" name="status" value={x} />
                          <button className="btn btn-ghost min-h-9 px-3 text-sm">Mark {STATUS[x].label.toLowerCase()}</button>
                        </form>
                      ))}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </>
      )}
    </div>
  );
}
