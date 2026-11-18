import { SUPABASE_URL } from "@/lib/env";
import { parseMedia, postMediaUrl, videoSite, youtubeId } from "@/lib/post-media";
import type { FeedPost } from "@/lib/feed-data";

/**
 * A post's photos (a grid of up to 4), its short video (plays in place, never on its own) and its video link
 * (YouTube plays inside the post with the privacy-enhanced player; Facebook and TikTok open in a new tab).
 */
export function PostMedia({ post }: { post: FeedPost }) {
  const items = parseMedia(JSON.stringify(post.media ?? []), post.author_id);
  const photos = items.filter((i) => i.type === "image");
  const video = items.find((i) => i.type === "video");
  const yt = youtubeId(post.video_url ?? null);
  if (!photos.length && !video && !post.video_url) return null;
  const who = post.author_name ?? "the member";
  return (
    <div className="mt-3 space-y-2">
      {photos.length > 0 && (
        <ul className={`grid gap-1 overflow-hidden rounded-xl ${photos.length === 1 ? "grid-cols-1" : "grid-cols-2"}`}>
          {photos.map((p, n) => (
            <li key={p.path} className={photos.length === 3 && n === 0 ? "col-span-2" : ""}>
              <a href={postMediaUrl(SUPABASE_URL, p.path)} target="_blank" rel="noopener" aria-label={`Open photo ${n + 1} of ${photos.length} from ${who} full size`}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={postMediaUrl(SUPABASE_URL, p.path)} alt={`Photo ${n + 1} from ${who}`} loading="lazy"
                  className={`w-full bg-bg-soft object-cover ${photos.length === 1 ? "max-h-[28rem]" : "aspect-square"}`} />
              </a>
            </li>
          ))}
        </ul>
      )}
      {video && (
        <video src={postMediaUrl(SUPABASE_URL, video.path)} controls playsInline preload="metadata" className="max-h-[28rem] w-full rounded-xl bg-black"
          aria-label={`Video from ${who}`} />
      )}
      {post.video_url && (yt ? (
        <div className="aspect-video overflow-hidden rounded-xl bg-black">
          <iframe src={`https://www.youtube-nocookie.com/embed/${yt}`} title={`YouTube video from ${who}`} loading="lazy" className="size-full"
            allow="accelerometer; encrypted-media; gyroscope; picture-in-picture" allowFullScreen referrerPolicy="strict-origin-when-cross-origin" />
        </div>
      ) : (
        <a href={post.video_url} target="_blank" rel="noopener nofollow ugc" className="card flex min-h-14 items-center gap-3 p-3 hover:border-primary">
          <span aria-hidden className="text-2xl">▶️</span>
          <span className="min-w-0"><span className="block font-semibold">Watch on {videoSite(post.video_url)}</span><span className="block truncate text-xs text-muted">{post.video_url}</span></span>
        </a>
      ))}
    </div>
  );
}
