"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { feedResult, withFocus } from "@/lib/member-shell";
import { safeNext } from "@/lib/safe-next";
import { COMMENT_MAX, POST_ERRORS, POST_MAX, isAudience, isPostKind, isReaction, parseCategory, postErrorCode } from "@/lib/feed-rules";
import { isGroupSlug } from "@/lib/groups";

const s = (v: FormDataEntryValue | null, max = 300) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const uuid = (v: string) => (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v) ? v : null);
const back = (fd: FormData) => safeNext(s(fd.get("back")), "/home");

export type FormState = { error?: string; values?: Record<string, string> };

/** New Post: publish, then go back to the feed scrolled to the new post. */
export async function createPost(_: FormState, fd: FormData): Promise<FormState> {
  const { supabase } = await requireUser("/new-post");
  const raw = typeof fd.get("body") === "string" ? (fd.get("body") as string).trim() : "";
  const kind = s(fd.get("kind"), 20);
  const cat = parseCategory(s(fd.get("category"), 200));
  const audience = s(fd.get("audience"), 20);
  const groupSlug = s(fd.get("group"), 80);
  const values = { body: raw, kind, category: s(fd.get("category"), 200), audience, group: groupSlug };
  if (!cat) return { error: POST_ERRORS.category, values };
  if (raw.length < 2) return { error: POST_ERRORS.too_short, values };
  if (raw.length > POST_MAX) return { error: POST_ERRORS.too_long, values };
  const row: Record<string, unknown> = { kind: isPostKind(kind) ? kind : "update", category: cat.category, subcategory: cat.subcategory, body: raw };
  // Friend-only and group posts need the 0018 database update; plain posts work either way.
  if (isAudience(audience) && audience !== "members") row.audience = audience;
  if (isGroupSlug(groupSlug)) {
    const { data: g } = await supabase.from("community_groups").select("id").eq("slug", groupSlug).maybeSingle();
    if (!g) return { error: POST_ERRORS.no_such_group, values };
    row.group_id = g.id;
  }
  const { data, error } = await supabase.from("feed_posts").insert(row).select("id, status").single();
  if (error || !data) return { error: POST_ERRORS[postErrorCode(error?.message)], values };
  revalidatePath("/home");
  revalidatePath("/forum", "layout");
  redirect(feedResult(data.status === "held" ? "post-held" : "posted", `post-${data.id}`));
}

/** Delete your own post (admins can delete any). Asked twice: the first press only opens the confirmation. */
export async function deletePost(fd: FormData) {
  const { supabase } = await requireUser("/home");
  const id = uuid(s(fd.get("post_id"), 40));
  if (id) await supabase.from("feed_posts").delete().eq("id", id);
  revalidatePath("/home");
  revalidatePath("/forum", "layout");
  redirect(feedResult("post-deleted"));
}

/** Comment, then back to where the member was, scrolled to the post. */
export async function addComment(_: FormState, fd: FormData): Promise<FormState> {
  const { supabase } = await requireUser("/home");
  const postId = uuid(s(fd.get("post_id"), 40));
  const body = typeof fd.get("body") === "string" ? (fd.get("body") as string).trim() : "";
  if (!postId) return { error: POST_ERRORS.failed };
  if (!body) return { error: "Please write a comment first.", values: { body } };
  if (body.length > COMMENT_MAX) return { error: POST_ERRORS.too_long, values: { body } };
  const { error } = await supabase.from("feed_comments").insert({ post_id: postId, body });
  if (error) return { error: POST_ERRORS[postErrorCode(error.message)], values: { body } };
  revalidatePath("/home");
  revalidatePath(`/posts/${postId}`);
  redirect(withFocus(back(fd), `post-${postId}`, "commented"));
}

export async function deleteComment(fd: FormData) {
  const { supabase } = await requireUser("/home");
  const id = uuid(s(fd.get("comment_id"), 40));
  const postId = uuid(s(fd.get("post_id"), 40));
  if (id) await supabase.from("feed_comments").delete().eq("id", id);
  if (postId) revalidatePath(`/posts/${postId}`);
  redirect(withFocus(back(fd), postId ? `post-${postId}` : "feed-stream"));
}

/** React to a post. Pressing your current reaction again takes it back. */
export async function reactToPost(fd: FormData) {
  const { supabase, user } = await requireUser("/home");
  const postId = uuid(s(fd.get("post_id"), 40));
  const kind = s(fd.get("kind"), 20);
  if (postId && isReaction(kind)) {
    if (s(fd.get("current"), 20) === kind) await supabase.from("feed_reactions").delete().eq("post_id", postId).eq("user_id", user.id);
    else {
      // Change an existing reaction, or add one. (Members may only change the kind, so no upsert.)
      const { data } = await supabase.from("feed_reactions").update({ kind }).eq("post_id", postId).eq("user_id", user.id).select("post_id");
      if (!data?.length) await supabase.from("feed_reactions").insert({ post_id: postId, user_id: user.id, kind });
    }
  }
  redirect(withFocus(back(fd), postId ? `post-${postId}` : "feed-stream"));
}
