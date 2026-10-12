import { adminContext } from "@/lib/admin/guard";
import { setRole, setMemberStatus } from "../actions";

export default async function Members({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q = "" } = await searchParams;
  const { db, roles: myRoles } = await adminContext(["super_admin", "admin"]);
  const isSuper = myRoles.includes("super_admin");
  let query = db.from("profiles").select("*").order("created_at", { ascending: false }).limit(200);
  if (q) query = query.or(`full_name.ilike.%${q.replace(/[%,()]/g, "")}%,member_code.ilike.%${q.replace(/[%,()]/g, "")}%,city.ilike.%${q.replace(/[%,()]/g, "")}%`);
  const [{ data: profiles }, { data: roleRows }, { data: chapters }, users] = await Promise.all([
    query, db.from("roles").select("*"), db.from("chapters").select("id,name"), db.auth.admin.listUsers({ perPage: 1000 }),
  ]);
  const emailOf = new Map((users.data?.users ?? []).map((u) => [u.id, { email: u.email, confirmed: Boolean(u.email_confirmed_at) }]));
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-extrabold text-primary">Members</h1>
        {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- file download from a route handler */}
        <a href="/admin/export/members" className="btn btn-outline">Export CSV</a>
      </div>
      <form className="flex gap-2"><input name="q" defaultValue={q} placeholder="Search name, member ID or city" className="input" aria-label="Search members" /><button className="btn btn-primary">Search</button></form>
      <div className="card overflow-x-auto">
        <table className="w-full text-left text-[15px]">
          <thead className="border-b border-line bg-bg-soft"><tr>{["Member", "Email", "Location", "Tier", "Roles", "Status"].map((h) => <th key={h} className="px-3 py-2">{h}</th>)}</tr></thead>
          <tbody>
            {(profiles ?? []).map((p) => {
              const u = emailOf.get(p.id);
              const r = (roleRows ?? []).filter((x) => x.user_id === p.id);
              return (
                <tr key={p.id} className="border-b border-line align-top last:border-0">
                  <td className="px-3 py-2"><b>{p.full_name ?? "—"}</b><br /><span className="font-mono text-sm">{p.member_code}</span></td>
                  <td className="px-3 py-2">{u?.email}<br /><span className="text-xs text-muted">{u?.confirmed ? "verified email" : "unverified"}</span></td>
                  <td className="px-3 py-2">{[p.city, p.province].filter(Boolean).join(", ") || "—"}</td>
                  <td className="px-3 py-2 capitalize">{p.tier}</td>
                  <td className="px-3 py-2">
                    {r.map((x) => (
                      <form key={x.role} action={setRole} className="inline">
                        <input type="hidden" name="user_id" value={p.id} /><input type="hidden" name="role" value={x.role} /><input type="hidden" name="op" value="remove" />
                        <span className="mr-1 inline-flex items-center gap-1 rounded-full bg-primary-soft px-2 py-0.5 text-xs font-bold text-primary">{x.role}{isSuper && <button aria-label={`Remove ${x.role}`}>×</button>}</span>
                      </form>
                    ))}
                    {isSuper && (
                      <form action={setRole} className="mt-1 flex flex-wrap gap-1">
                        <input type="hidden" name="user_id" value={p.id} /><input type="hidden" name="op" value="add" />
                        <select name="role" className="input min-h-9 w-auto py-1 text-sm" aria-label="Role"><option value="editor">editor</option><option value="chapter_leader">chapter_leader</option><option value="admin">admin</option><option value="super_admin">super_admin</option></select>
                        <select name="chapter_id" className="input min-h-9 w-auto py-1 text-sm" aria-label="Chapter (for chapter leaders)"><option value="">(chapter)</option>{(chapters ?? []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
                        <button className="btn btn-outline min-h-9 px-2 text-sm">Add</button>
                      </form>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    <form action={setMemberStatus}><input type="hidden" name="id" value={p.id} /><input type="hidden" name="status" value={p.status === "active" ? "suspended" : "active"} />
                      <span className="capitalize">{p.status}</span> <button className="ml-1 text-sm text-mph underline">{p.status === "active" ? "Suspend" : "Reactivate"}</button>
                    </form>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
