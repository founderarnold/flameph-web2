import Link from "next/link";
import { notFound } from "next/navigation";
import { adminContext } from "@/lib/admin/guard";
import { getAdminTable, PK, type AdminField } from "@/lib/admin/config";
import { saveRow, deleteRow } from "@/app/admin/actions";
import { mediaUrl } from "@/lib/content";
import { Notice } from "@/components/ui";

const toLocal = (iso: unknown) => {
  if (!iso) return "";
  const d = new Date(String(iso));
  return new Date(d.getTime() + 8 * 3600_000).toISOString().slice(0, 16); // Manila time for datetime-local
};

export default async function Edit({ params, searchParams }: { params: Promise<{ table: string; id: string }>; searchParams: Promise<{ error?: string }> }) {
  const { table, id } = await params;
  const sp = await searchParams;
  const cfg = getAdminTable(table);
  if (!cfg) notFound();
  const { db, onlyChapterLeader } = await adminContext(cfg.roles);
  const row: Record<string, unknown> = id === "new" ? { status: table === "chapters" ? "forming" : table === "events" ? "scheduled" : undefined, registration_open: true, published: false } : ((await db.from(table).select("*").eq(PK[table] ?? "id", id).single()).data ?? {});
  if (id !== "new" && !row[PK[table] ?? "id"]) notFound();

  const signed = async (path: unknown) => (path ? (await db.storage.from("private-docs").createSignedUrl(String(path), 600)).data?.signedUrl : null);
  const privateLinks: Record<string, string | null | undefined> = {};
  for (const f of cfg.fields) if (f.type === "privateFile") privateLinks[f.name] = await signed(row[f.name]);

  return (
    <div className="max-w-2xl space-y-4">
      <p><Link href={`/admin/content/${table}`} className="text-mph underline">← {cfg.label}</Link></p>
      <h1 className="text-2xl font-extrabold text-primary">{id === "new" ? `New ${cfg.singular}` : `Edit ${cfg.singular}`}</h1>
      {sp.error && <Notice>{sp.error}</Notice>}
      {cfg.publishRule && <Notice tone="info">{cfg.publishRule.message}</Notice>}
      <form action={saveRow} className="card space-y-4 p-5">
        <input type="hidden" name="__table" value={table} />
        <input type="hidden" name="__id" value={id} />
        {cfg.fields.map((f) => <FieldInput key={f.name} f={f} value={row[f.name]} privateLink={privateLinks[f.name]} />)}
        <button className="btn btn-primary">Save</button>
      </form>
      {id !== "new" && !onlyChapterLeader && (
        <form action={deleteRow}>
          <input type="hidden" name="__table" value={table} /><input type="hidden" name="__id" value={id} />
          <button className="btn btn-ghost text-red-700 dark:text-red-300">Delete this {cfg.singular}</button>
        </form>
      )}
    </div>
  );
}

function FieldInput({ f, value, privateLink }: { f: AdminField; value: unknown; privateLink?: string | null }) {
  const id = `f-${f.name}`;
  const label = <label htmlFor={id} className="label">{f.label}{f.required && " *"}</label>;
  const help = f.help && <p className="mt-1 text-sm text-muted">{f.help}</p>;
  switch (f.type) {
    case "bool":
      return <div><label className="flex items-center gap-2 font-semibold"><input id={id} name={f.name} type="checkbox" defaultChecked={Boolean(value)} className="h-5 w-5" />{f.label}</label>{help}</div>;
    case "textarea":
      return <div>{label}<textarea id={id} name={f.name} rows={f.name === "body" ? 14 : 4} defaultValue={String(value ?? "")} required={f.required} className="input font-mono text-[15px]" />{help}</div>;
    case "select":
      return <div>{label}<select id={id} name={f.name} defaultValue={String(value ?? "")} required={f.required} className="input"><option value="">—</option>{f.options!.map((o) => <option key={o}>{o}</option>)}</select>{help}</div>;
    case "number":
      return <div>{label}<input id={id} name={f.name} type="number" step="any" defaultValue={value == null ? "" : String(value)} required={f.required} className="input" />{help}</div>;
    case "date":
      return <div>{label}<input id={id} name={f.name} type="date" defaultValue={String(value ?? "")} required={f.required} className="input" />{help}</div>;
    case "datetime":
      return <div>{label}<input id={id} name={f.name} type="datetime-local" defaultValue={toLocal(value)} required={f.required} className="input" /><p className="mt-1 text-sm text-muted">Philippine time</p>{help}</div>;
    case "links":
      return <div>{label}<textarea id={id} name={f.name} rows={3} defaultValue={((value as { label: string; url: string }[]) ?? []).map((l) => `${l.label} | ${l.url}`).join("\n")} placeholder="BIR | https://www.bir.gov.ph" className="input font-mono text-[15px]" /><p className="mt-1 text-sm text-muted">One per line: Label | https://…</p></div>;
    case "benefits":
      return <div>{label}<textarea id={id} name={f.name} rows={5} defaultValue={((value as { label: string; status: string }[]) ?? []).map((b) => `${b.label} | ${b.status}`).join("\n")} placeholder="Directory listing | live" className="input font-mono text-[15px]" /><p className="mt-1 text-sm text-muted">One per line: Benefit | live, beta or soon</p>{help}</div>;
    case "image": {
      const url = mediaUrl(value as string);
      return (
        <div>{label}
          {url && (/\.(png|jpe?g|webp|gif)$/i.test(String(value))
            // eslint-disable-next-line @next/next/no-img-element
            ? <img src={url} alt="" className="mb-2 h-24 rounded-lg object-cover" />
            : <a href={url} className="mb-2 block text-mph underline" target="_blank" rel="noopener">Current file</a>)}
          <input id={id} name={f.name} type="file" accept={f.name === "file_path" ? undefined : "image/*"} className="block min-h-11" />
          {value ? <label className="mt-1 flex items-center gap-2 text-sm"><input type="checkbox" name={`${f.name}__remove`} /> Remove current file</label> : null}
          {help}
        </div>
      );
    }
    case "privateFile":
      return (
        <div>{label}
          {privateLink && <a href={privateLink} className="mb-2 block text-mph underline" target="_blank" rel="noopener">View current file (private link, expires in 10 min)</a>}
          <input id={id} name={f.name} type="file" accept="application/pdf,image/*" className="block min-h-11" />{help}
        </div>
      );
    case "images":
      return (
        <div>{label}
          <div className="mb-2 flex flex-wrap gap-2">
            {((value as string[]) ?? []).map((p) => (
              <label key={p} className="relative">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={mediaUrl(p)!} alt="" className="h-20 w-20 rounded-lg object-cover" />
                <span className="mt-1 flex items-center gap-1 text-xs"><input type="checkbox" name={`${f.name}__keep`} value={p} defaultChecked /> keep</span>
              </label>
            ))}
          </div>
          <input id={id} name={f.name} type="file" accept="image/*" multiple className="block min-h-11" />{help}
        </div>
      );
    default:
      return <div>{label}<input id={id} name={f.name} type={f.type === "url" ? "url" : "text"} defaultValue={String(value ?? "")} required={f.required} className="input" />{help}</div>;
  }
}
