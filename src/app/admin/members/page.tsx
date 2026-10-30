import { adminContext } from "@/lib/admin/guard";
import { SyncedTableScroll } from "@/components/admin/SyncedTableScroll";
import { deleteMember, setRole, setMemberStatus } from "../actions";

type RoleRow = { user_id: string; role: string };
type Chapter = { id: string; name: string };

function RoleControls({ memberId, roles, chapters, isSuper }: { memberId: string; roles: RoleRow[]; chapters: Chapter[]; isSuper: boolean }) {
  return <>
    <div className="flex flex-wrap gap-1">
      {roles.map((role) => (
        <form key={role.role} action={setRole}>
          <input type="hidden" name="user_id" value={memberId} /><input type="hidden" name="role" value={role.role} /><input type="hidden" name="op" value="remove" />
          <span className="inline-flex items-center gap-1 rounded-full bg-primary-soft px-2 py-0.5 text-xs font-bold text-primary">{role.role}{isSuper && <button className="min-h-6 min-w-6" aria-label={`Remove ${role.role}`}>×</button>}</span>
        </form>
      ))}
    </div>
    {isSuper && (
      <form action={setRole} className="mt-2 grid gap-2 sm:grid-cols-2 xl:grid-cols-1">
        <input type="hidden" name="user_id" value={memberId} /><input type="hidden" name="op" value="add" />
        <select name="role" className="input min-h-10 py-1 text-sm" aria-label="Role"><option value="editor">editor</option><option value="chapter_leader">chapter_leader</option><option value="admin">admin</option><option value="super_admin">super_admin</option></select>
        <select name="chapter_id" className="input min-h-10 py-1 text-sm" aria-label="Chapter (for chapter leaders)"><option value="">(chapter)</option>{chapters.map((chapter) => <option key={chapter.id} value={chapter.id}>{chapter.name}</option>)}</select>
        <button className="btn btn-outline min-h-10 px-3 py-1 text-sm sm:col-span-2 xl:col-span-1">Add role</button>
      </form>
    )}
  </>;
}

function StatusControl({ id, status }: { id: string; status: string }) {
  return <form action={setMemberStatus} className="flex flex-wrap items-center gap-2"><input type="hidden" name="id" value={id} /><input type="hidden" name="status" value={status === "active" ? "suspended" : "active"} />
    <span className="rounded-full bg-bg-soft px-2 py-0.5 capitalize">{status}</span><button className="text-sm font-semibold text-mph underline">{status === "active" ? "Suspend" : "Reactivate"}</button>
  </form>;
}

function DeleteMemberControl({ id }: { id: string }) {
  return <details className="mt-3"><summary className="cursor-pointer text-xs font-semibold text-flame-strong">Delete member permanently…</summary><form action={deleteMember} className="mt-2 space-y-2"><input type="hidden" name="id" value={id} /><label className="block text-xs">Type DELETE to confirm<input name="confirmation" className="input mt-1 min-h-10 py-1 text-sm" autoComplete="off" /></label><button className="btn btn-flame min-h-10 w-full px-3 py-1 text-sm">Delete member and owned listings</button></form></details>;
}

export default async function Members({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q = "" } = await searchParams;
  const { db, roles: myRoles, user: adminUser } = await adminContext(["super_admin", "admin"]);
  const isSuper = myRoles.includes("super_admin");
  let query = db.from("profiles").select("*").order("created_at", { ascending: false }).limit(200);
  if (q) query = query.or(`full_name.ilike.%${q.replace(/[%,()]/g, "")}%,member_code.ilike.%${q.replace(/[%,()]/g, "")}%,city.ilike.%${q.replace(/[%,()]/g, "")}%`);
  const [{ data: profiles }, { data: roleRows }, { data: chapters }, users] = await Promise.all([
    query, db.from("roles").select("*"), db.from("chapters").select("id,name"), db.auth.admin.listUsers({ perPage: 1000 }),
  ]);
  const emailOf = new Map((users.data?.users ?? []).map((u) => [u.id, { email: u.email, confirmed: Boolean(u.email_confirmed_at) }]));
  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-2xl font-extrabold text-primary">Members</h1>
        {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- file download from a route handler */}
        <a href="/admin/export/members" className="btn btn-outline w-full sm:w-auto">Export CSV</a>
      </div>
      <form className="flex flex-col gap-2 sm:flex-row"><input name="q" defaultValue={q} placeholder="Search name, member ID or city" className="input min-w-0" aria-label="Search members" /><button className="btn btn-primary w-full sm:w-auto">Search</button></form>
      <div className="space-y-3 lg:hidden">
        {(profiles ?? []).map((profile) => {
          const user = emailOf.get(profile.id);
          const memberRoles = (roleRows ?? []).filter((role) => role.user_id === profile.id) as RoleRow[];
          return <article key={profile.id} className="card overflow-hidden">
            <div className="border-b border-line bg-bg-soft p-4">
              <h2 className="break-words font-extrabold text-primary">{profile.full_name ?? "—"}</h2>
              <p className="break-all font-mono text-xs text-muted">{profile.member_code}</p>
            </div>
            <dl className="grid gap-3 p-4 sm:grid-cols-2">
              <div><dt className="text-xs font-bold uppercase text-muted">Email</dt><dd className="break-all">{user?.email || "—"}</dd><dd className="text-xs text-muted">{user?.confirmed ? "verified email" : "unverified"}</dd></div>
              <div><dt className="text-xs font-bold uppercase text-muted">Location</dt><dd>{[profile.city, profile.province].filter(Boolean).join(", ") || "—"}</dd></div>
              <div><dt className="text-xs font-bold uppercase text-muted">Tier</dt><dd className="capitalize">{profile.tier}</dd></div>
              <div><dt className="text-xs font-bold uppercase text-muted">Status</dt><dd className="mt-1"><StatusControl id={profile.id} status={profile.status} />{isSuper && profile.id !== adminUser.id && <DeleteMemberControl id={profile.id} />}</dd></div>
              <div className="sm:col-span-2"><dt className="text-xs font-bold uppercase text-muted">Roles</dt><dd className="mt-1"><RoleControls memberId={profile.id} roles={memberRoles} chapters={(chapters ?? []) as Chapter[]} isSuper={isSuper} /></dd></div>
            </dl>
          </article>;
        })}
      </div>
      <SyncedTableScroll label="Members table">
        <table className="min-w-[1120px] table-fixed text-left text-[15px]">
          <colgroup><col className="w-[220px]" /><col className="w-[250px]" /><col className="w-[180px]" /><col className="w-[80px]" /><col className="w-[260px]" /><col className="w-[130px]" /></colgroup>
          <thead className="border-b border-line bg-bg-soft"><tr>{["Member", "Email", "Location", "Tier", "Roles", "Status"].map((h) => <th key={h} className="px-3 py-2">{h}</th>)}</tr></thead>
          <tbody>
            {(profiles ?? []).map((p) => {
              const u = emailOf.get(p.id);
              const r = (roleRows ?? []).filter((x) => x.user_id === p.id);
              return (
                <tr key={p.id} className="border-b border-line align-top last:border-0">
                  <td className="break-words px-3 py-2"><b>{p.full_name ?? "—"}</b><br /><span className="break-all font-mono text-xs">{p.member_code}</span></td>
                  <td className="break-all px-3 py-2">{u?.email}<br /><span className="text-xs text-muted">{u?.confirmed ? "verified email" : "unverified"}</span></td>
                  <td className="break-words px-3 py-2">{[p.city, p.province].filter(Boolean).join(", ") || "—"}</td>
                  <td className="px-3 py-2 capitalize">{p.tier}</td>
                  <td className="px-3 py-2">
                    <RoleControls memberId={p.id} roles={r as RoleRow[]} chapters={(chapters ?? []) as Chapter[]} isSuper={isSuper} />
                  </td>
                  <td className="px-3 py-2">
                    <StatusControl id={p.id} status={p.status} />
                    {isSuper && p.id !== adminUser.id && <DeleteMemberControl id={p.id} />}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </SyncedTableScroll>
    </div>
  );
}
