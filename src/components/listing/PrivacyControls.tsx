import Link from "next/link";
import { ALWAYS_PUBLIC, FIELD_GROUPS, visibilityOf } from "@/lib/privacy";
import { savePrivacy } from "@/app/account/onboarding-actions";
import { SubmitButton } from "@/components/SubmitButton";
import { Notice, Switch } from "@/components/ui";

/** Settings → Privacy: for each group of business details, everyone or signed-in members only. */
export function PrivacyControls({ biz, status }: { biz: Record<string, unknown> | null; status?: string }) {
  const ready = Boolean(biz && "field_visibility" in biz);
  return (
    <section id="privacy" aria-labelledby="privacy-h" className="card scroll-mt-24 space-y-4 p-5">
      <h2 id="privacy-h" className="text-xl font-extrabold">Who can see your business details</h2>
      {status === "saved" && <div role="status"><Notice tone="ok">Privacy choices saved.</Notice></div>}
      {status === "error" && <Notice tone="danger">That didn&apos;t save. Please try again.</Notice>}
      {!biz ? (
        <p className="text-sm text-muted">You haven&apos;t listed a business yet. <Link href="/account/business" className="underline">List your business</Link> first, then choose who sees each detail.</p>
      ) : !ready ? (
        <Notice tone="info">These choices open after FLAME PH finishes a database update.</Notice>
      ) : (
        <form action={savePrivacy} className="space-y-3">
          <p className="text-sm text-muted">Turn a switch on to show that detail only to signed-in FLAME PH members. Off means everyone can see it.</p>
          {FIELD_GROUPS.map((g) => (
            <Switch key={g.key} name={`members_${g.key}`} label={`${g.label}: members only`} description={g.help} defaultChecked={visibilityOf(biz.field_visibility, g.key) === "members"} />
          ))}
          <p className="text-sm text-muted">Always shown to everyone, because they make up your listing: {ALWAYS_PUBLIC.join(", ").toLowerCase()}. Your registration numbers have their own choice in <Link href="/account/business#details" className="underline">My business</Link>.</p>
          <SubmitButton className="btn btn-primary btn-ds w-full sm:w-auto">Save privacy choices</SubmitButton>
        </form>
      )}
    </section>
  );
}
