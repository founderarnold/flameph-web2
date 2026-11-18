// Photos and videos in member posts. Pure rules, shared by the composer, the post action, the post card and the tests.
// The database (0023_member_journey.sql, feed_posts_media_check) checks the same limits against the stored files.

export const MAX_PHOTOS = 4;
export const PHOTO_MAX_BYTES = 5 * 1024 * 1024;
export const VIDEO_MAX_BYTES = 20 * 1024 * 1024;
export const PHOTO_MIMES = ["image/jpeg", "image/png", "image/webp"] as const;
export const VIDEO_MIMES = ["video/mp4", "video/webm", "video/quicktime"] as const;

export type MediaItem = { type: "image" | "video"; path: string };

const EXT: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "video/mp4": "mp4", "video/webm": "webm", "video/quicktime": "mov" };

/** Where a member's post file is stored in the public media bucket: their own folder, a name the database accepts. */
export function mediaPath(userId: string, mime: string, n: number, now = Date.now()) {
  return `${userId}/post-${now.toString(36)}-${n}-${Math.random().toString(36).slice(2, 8)}.${EXT[mime] ?? "bin"}`;
}

/** Why a chosen file can't be added, in plain words (null when it's fine). */
export function fileProblem(f: { type: string; size: number }, kind: "image" | "video"): string | null {
  if (kind === "image") {
    if (!(PHOTO_MIMES as readonly string[]).includes(f.type)) return "Photos must be JPG, PNG or WEBP.";
    if (f.size > PHOTO_MAX_BYTES) return "That photo is bigger than 5 MB. Please choose a smaller one.";
  } else {
    if (!(VIDEO_MIMES as readonly string[]).includes(f.type)) return "Videos must be MP4, WEBM or MOV.";
    if (f.size > VIDEO_MAX_BYTES) return "That video is bigger than 20 MB. Trim it to a short clip, or post a YouTube, Facebook or TikTok link instead.";
  }
  return null;
}

/** The media list sent with a post: only the member's own post files, at most 4 photos and 1 video. Anything else is dropped. */
export function parseMedia(raw: string, userId: string): MediaItem[] {
  let v: unknown;
  try { v = JSON.parse(raw || "[]"); } catch { return []; }
  if (!Array.isArray(v)) return [];
  const re = new RegExp(`^${userId}/post-[A-Za-z0-9._-]{1,120}$`);
  const out: MediaItem[] = [];
  let photos = 0, videos = 0;
  for (const x of v.slice(0, 10)) {
    if (!x || typeof x !== "object") continue;
    const { type, path } = x as Record<string, unknown>;
    if ((type !== "image" && type !== "video") || typeof path !== "string" || !re.test(path)) continue;
    if (type === "image" && photos >= MAX_PHOTOS) continue;
    if (type === "video" && videos >= 1) continue;
    if (type === "image") photos++; else videos++;
    out.push({ type, path });
  }
  return out;
}

/** A YouTube, Facebook or TikTok video address, made https. Null for anything else. */
export function videoLink(raw: string): string | null {
  const v = raw.trim();
  if (!v) return null;
  let u: URL;
  try { u = new URL(/^https?:\/\//i.test(v) ? v : `https://${v}`); } catch { return null; }
  const host = u.hostname.toLowerCase();
  const ok = /(^|\.)(youtube\.com|youtu\.be|facebook\.com|fb\.watch|tiktok\.com)$/.test(host);
  if (!ok || u.username || u.password || u.port) return null;
  u.protocol = "https:";
  const s = u.toString();
  return s.length <= 300 && !/[\s<>"]/.test(s) ? s : null;
}

/** A YouTube video can play inside the post (privacy-enhanced player). Other sites open in a new tab. */
export function youtubeId(url: string | null): string | null {
  if (!url) return null;
  try {
    const u = new URL(url);
    const host = u.hostname.replace(/^www\.|^m\./, "");
    const id = host === "youtu.be" ? u.pathname.slice(1)
      : host === "youtube.com" ? (u.searchParams.get("v") ?? u.pathname.match(/^\/(shorts|embed|live)\/([^/]+)/)?.[2] ?? null) : null;
    return id && /^[A-Za-z0-9_-]{6,20}$/.test(id) ? id : null;
  } catch { return null; }
}

export const videoSite = (url: string) => {
  const h = (() => { try { return new URL(url).hostname; } catch { return ""; } })();
  return /youtu/.test(h) ? "YouTube" : /tiktok/.test(h) ? "TikTok" : /facebook|fb\.watch/.test(h) ? "Facebook" : "video";
};

/** Public address of a file in the media bucket (works in the browser and on the server). */
export const postMediaUrl = (base: string, path: string) => `${base}/storage/v1/object/public/media/${path.split("/").map(encodeURIComponent).join("/")}`;
