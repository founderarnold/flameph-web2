import Link from "next/link";
import { adminContext } from "@/lib/admin/guard";
import { mediaUrl, type EventRow } from "@/lib/content";
import { Notice } from "@/components/ui";
import { youtubeId } from "@/lib/post-media";

/**
 * Workshop gallery tab. The public gallery (/workshops/gallery) shows completed, published workshops and trainings
 * with their real photos, description and YouTube video. Each one is an ordinary event, so adding and editing
 * opens the existing Events editor (photo upload included). Nothing is stored twice.
 */
export default async function WorkshopGalleryAdmin() {
  const { db } = await adminContext(["super_admin", "admin", "editor"]);
  const { data } = await db.from("events").select("*").in("type", ["workshop", "training"]).order("starts_at", { ascending: false }).limit(300);
  const rows = (data ?? []) as (EventRow & { published: boolean })[];
  const inGallery = (e: EventRow & { published: boolean }) => e.status === "completed" && e.published;
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-extrabold text-primary">Workshop gallery</h1>
        <div className="flex flex-wrap gap-2">
          <Link href="/admin/content/events/new" className="btn btn-primary">Add a past workshop</Link>
          <a href="/workshops/gallery" target="_blank" rel="noopener" className="btn btn-outline">View public gallery</a>
        </div>
      </div>
      <Notice tone="info">
        <strong>How to add a workshop to the gallery:</strong> press <em>Add a past workshop</em> (or <em>Edit</em> below). Set Type to <em>workshop</em> or <em>training</em>, Status to <em>completed</em>, write the description (mention partner LGUs, agencies and institutions), upload real photos, paste a YouTube link in <em>Online link</em> if there is a video, tick <em>Published</em>, then Save.
      </Notice>
      {rows.length === 0 ? <p className="text-muted">No workshops yet.</p> : (
        <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {rows.map((e) => (
            <li key={e.id} className="card overflow-hidden">
              {e.photos?.[0]
                // eslint-disable-next-line @next/next/no-img-element
                ? <img src={mediaUrl(e.photos[0])!} alt="" className="aspect-video w-full object-cover" loading="lazy" />
                : <div className="grid aspect-video place-items-center bg-bg-soft text-sm text-muted">No photos yet</div>}
              <div className="space-y-1 p-4">
                <p className={`text-xs font-bold uppercase ${inGallery(e) ? "text-ok" : "text-warn"}`}>{inGallery(e) ? "Shown in gallery" : e.status !== "completed" ? `Not in gallery: status is ${e.status}` : "Not in gallery: not published"}</p>
                <h2 className="font-bold leading-snug">{e.title}</h2>
                <p className="text-sm text-muted">{new Date(e.starts_at).toLocaleDateString("en-PH", { dateStyle: "medium", timeZone: "Asia/Manila" })}{e.city ? ` · ${e.city}` : ""}</p>
                <p className="text-sm text-muted">{e.photos?.length ?? 0} photo{e.photos?.length === 1 ? "" : "s"} · {youtubeId(e.online_url) ? "YouTube video ✓" : "No video"}</p>
                <Link href={`/admin/content/events/${e.id}`} className="btn btn-outline mt-2">Edit photos and description</Link>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
