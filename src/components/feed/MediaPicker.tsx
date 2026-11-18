"use client";
import { useRef, useState } from "react";
import { createClient } from "@/lib/supabase/browser";
import { SUPABASE_URL } from "@/lib/env";
import { MAX_PHOTOS, PHOTO_MIMES, VIDEO_MIMES, fileProblem, mediaPath, postMediaUrl, videoLink, type MediaItem } from "@/lib/post-media";

/**
 * Photos (up to 4) and one short video for a post, uploaded straight from the phone to the member's own folder in
 * FLAME PH's media storage, or a YouTube, Facebook or TikTok link. The chosen files travel with the form as a hidden field.
 */
export function MediaPicker({ userId, initial = [], initialLink = "" }: { userId: string; initial?: MediaItem[]; initialLink?: string }) {
  const supabase = createClient();
  const [items, setItems] = useState<MediaItem[]>(initial);
  const [link, setLink] = useState(initialLink);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const photoInput = useRef<HTMLInputElement>(null);
  const videoInput = useRef<HTMLInputElement>(null);
  const photos = items.filter((i) => i.type === "image").length;
  const hasVideo = items.some((i) => i.type === "video");
  const linkOk = !link.trim() || Boolean(videoLink(link));

  async function add(files: FileList | null, type: "image" | "video") {
    if (!files?.length || !supabase) return;
    setMsg(null);
    const room = type === "image" ? MAX_PHOTOS - photos : hasVideo || link.trim() ? 0 : 1;
    const list = [...files].slice(0, Math.max(room, 0));
    if (!list.length) { setMsg(type === "image" ? "You can add up to 4 photos." : "You can add one video per post: either an upload or a link."); return; }
    const added: MediaItem[] = [];
    for (const [n, f] of list.entries()) {
      const problem = fileProblem(f, type);
      if (problem) { setMsg(problem); continue; }
      setBusy(type === "image" ? `Uploading photo ${n + 1} of ${list.length}…` : "Uploading video… this can take a minute on mobile data.");
      const path = mediaPath(userId, f.type, items.length + n);
      const { error } = await supabase.storage.from("media").upload(path, f, { contentType: f.type, upsert: false });
      if (error) { setMsg("The upload didn't go through. Please check your connection and try again."); continue; }
      added.push({ type, path });
    }
    setItems((cur) => [...cur, ...added]);
    setBusy(null);
    if (photoInput.current) photoInput.current.value = "";
    if (videoInput.current) videoInput.current.value = "";
  }

  async function remove(item: MediaItem) {
    setItems((cur) => cur.filter((i) => i.path !== item.path));
    await supabase?.storage.from("media").remove([item.path]);
  }

  return (
    <fieldset className="space-y-3">
      <legend className="label">Photos or video <span className="font-normal text-muted">(optional)</span></legend>
      <input type="hidden" name="media" value={JSON.stringify(items)} />
      {items.length > 0 && (
        <ul className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {items.map((i, n) => (
            <li key={i.path} className="relative overflow-hidden rounded-xl border border-line bg-bg-soft">
              {i.type === "image"
                // eslint-disable-next-line @next/next/no-img-element
                ? <img src={postMediaUrl(SUPABASE_URL, i.path)} alt={`Photo ${n + 1}`} className="aspect-square w-full object-cover" />
                : <video src={postMediaUrl(SUPABASE_URL, i.path)} className="aspect-square w-full bg-black object-cover" muted playsInline preload="metadata" aria-label="Your video" />}
              <button type="button" onClick={() => remove(i)} className="absolute right-1 top-1 inline-flex size-11 items-center justify-center rounded-full bg-black/60 text-lg text-white" aria-label={`Remove ${i.type === "image" ? `photo ${n + 1}` : "video"}`}>×</button>
            </li>
          ))}
        </ul>
      )}
      <div className="grid grid-cols-2 gap-2">
        <label className={`btn btn-outline min-h-11 cursor-pointer ${photos >= MAX_PHOTOS || busy ? "pointer-events-none opacity-50" : ""}`}>
          <span aria-hidden>📷</span> Photos
          <input ref={photoInput} type="file" accept={PHOTO_MIMES.join(",")} multiple className="sr-only" disabled={photos >= MAX_PHOTOS || Boolean(busy)} onChange={(e) => add(e.target.files, "image")} />
        </label>
        <label className={`btn btn-outline min-h-11 cursor-pointer ${hasVideo || link.trim() || busy ? "pointer-events-none opacity-50" : ""}`}>
          <span aria-hidden>🎬</span> Video
          <input ref={videoInput} type="file" accept={VIDEO_MIMES.join(",")} className="sr-only" disabled={hasVideo || Boolean(link.trim()) || Boolean(busy)} onChange={(e) => add(e.target.files, "video")} />
        </label>
      </div>
      <p className="text-xs text-muted">Up to 4 photos (5 MB each) and one short video (up to 20 MB). Business photos and clips only: your products, shop, team or work.</p>
      {!hasVideo && (
        <div>
          <label htmlFor="post-video-url" className="label">Or a video link</label>
          <input id="post-video-url" name="video_url" inputMode="url" maxLength={300} value={link} onChange={(e) => setLink(e.target.value)}
            placeholder="YouTube, Facebook or TikTok link" className="input min-h-11 w-full" aria-invalid={!linkOk} aria-describedby="post-video-help" />
          <p id="post-video-help" className={`mt-1 text-xs ${linkOk ? "text-muted" : "font-semibold text-danger"}`}>{linkOk ? "For longer videos. It shows as a video in your post." : "Please use a YouTube, Facebook or TikTok link."}</p>
        </div>
      )}
      <p aria-live="polite" className="text-sm">{busy ? <span className="text-muted">{busy}</span> : msg ? <span className="font-semibold text-danger">{msg}</span> : null}</p>
    </fieldset>
  );
}
