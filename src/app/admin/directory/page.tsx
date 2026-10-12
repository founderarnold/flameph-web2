import Link from "next/link";
import { adminContext } from "@/lib/admin/guard";
import { verifyBusiness } from "../actions";

export default async function DirectoryAdmin({ searchParams }: { searchParams: Promise<{ all?: string }> }) {
  const sp = await searchParams;
  const { db } = await adminContext(["super_admin", "admin"]);
  let q = db.from("businesses").select("*").order("updated_at", { ascending: false }).limit(200);
  if (!sp.all) q = q.eq("verification_status", "pending");
  const { data: rows } = await q;
  const withLinks = await Promise.all((rows ?? []).map(async (b) => ({
    ...b,
    docs: await Promise.all((b.verification_docs as string[]).map(async (p) => ({ p, url: (await db.storage.from("private-docs").createSignedUrl(p, 600)).data?.signedUrl }))),
  })));
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-extrabold text-primary">Directory verification</h1>
      <p><Link className="text-mph underline" href={sp.all ? "/admin/directory" : "/admin/directory?all=1"}>{sp.all ? "Show pending only" : "Show all listings"}</Link></p>
      {withLinks.length === 0 ? <p className="text-muted">No listings to review.</p> : withLinks.map((b) => (
        <div key={b.id} className="card p-4">
          <p className="font-bold">{b.name} <span className="text-sm font-normal text-muted">· {b.sector} · {[b.city, b.province].filter(Boolean).join(", ")} · {b.published ? "published" : "hidden"} · {b.verification_status}{b.verified && " ✓"}</span></p>
          {b.published && <Link href={`/directory/${b.slug}`} className="text-sm text-mph underline">View public page</Link>}
          <ul className="mt-2 space-y-1">{b.docs.map((d: { p: string; url?: string }) => <li key={d.p}><a className="text-mph underline" href={d.url ?? "#"} target="_blank" rel="noopener">{d.p.split("/").pop()}</a></li>)}</ul>
          <form action={verifyBusiness} className="mt-3 flex flex-wrap items-end gap-2">
            <input type="hidden" name="id" value={b.id} />
            <input name="note" placeholder="Note to record (e.g. DTI cert no. checked)" className="input flex-1" aria-label="Verification note" defaultValue={b.verification_note ?? ""} />
            <button name="decision" value="approve" className="btn btn-primary">Approve</button>
            <button name="decision" value="reject" className="btn btn-outline">Reject</button>
            {b.published && <button name="decision" value="unpublish" className="btn btn-ghost">Unpublish</button>}
          </form>
        </div>
      ))}
    </div>
  );
}
