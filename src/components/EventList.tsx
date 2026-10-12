import { EmptyState } from "./ui";
import { EventRegister } from "./EventRegister";
import { mediaUrl, type EventRow } from "@/lib/content";
import { FORMS } from "@/lib/forms";

const dt = (s: string) => new Date(s).toLocaleString("en-PH", { timeZone: "Asia/Manila", dateStyle: "full", timeStyle: "short" });

export function EventList({ upcoming, past, emptyCta }: { upcoming: EventRow[]; past: EventRow[]; emptyCta: { href: string; label: string } }) {
  return (
    <div className="space-y-10">
      <div>
        <h2 className="text-2xl font-extrabold">Upcoming</h2>
        <div className="mt-4 space-y-4">
          {upcoming.length === 0 ? (
            <EmptyState title="No upcoming events yet." text="Request a free workshop for your barangay or LGU." cta={emptyCta} />
          ) : (
            upcoming.map((e) => (
              <article key={e.id} className="card p-5">
                <p className="text-sm font-bold uppercase text-flame-strong">{e.type}</p>
                <h3 className="mt-1 text-xl font-bold">{e.title}</h3>
                <p className="mt-1 text-muted">{dt(e.starts_at)}</p>
                <p className="text-muted">{[e.venue, e.city, e.province].filter(Boolean).join(", ") || (e.online_url ? "Online" : "")}</p>
                {e.description && <p className="mt-3 whitespace-pre-line">{e.description}</p>}
                {e.registration_open && <EventRegister def={FORMS["event-registration"]} eventId={e.id} title={e.title} />}
              </article>
            ))
          )}
        </div>
      </div>
      {past.length > 0 && (
        <div>
          <h2 className="text-2xl font-extrabold">Past events</h2>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            {past.map((e) => (
              <article key={e.id} className="card overflow-hidden">
                {e.photos?.[0] && (
                  // Real photos uploaded by admins only.
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={mediaUrl(e.photos[0])!} alt={`Photo from ${e.title}`} loading="lazy" className="aspect-video w-full object-cover" />
                )}
                <div className="p-5">
                  <h3 className="text-lg font-bold">{e.title}</h3>
                  <p className="text-sm text-muted">{new Date(e.starts_at).toLocaleDateString("en-PH", { dateStyle: "long", timeZone: "Asia/Manila" })}{e.city ? ` · ${e.city}` : ""}</p>
                  {e.attendance_actual != null && <p className="mt-1 text-sm font-semibold">Recorded attendance: {e.attendance_actual}</p>}
                </div>
              </article>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
