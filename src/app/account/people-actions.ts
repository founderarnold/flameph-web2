"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { safeNext } from "@/lib/safe-next";
import { isGroupSlug } from "@/lib/groups";
import { postErrorCode } from "@/lib/feed-rules";

// Friend, mute, block and groups. Every rule (both must accept, no requests across a block, Friend-only posts) is
// enforced by the database (0018); these actions only ask for the change and send the member back where they were.

const s = (v: FormDataEntryValue | null, max = 300) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const uuid = (v: string) => (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v) ? v : null);

function back(fd: FormData, note?: string): never {
  const to = safeNext(s(fd.get("back")), "/friends");
  if (!note) redirect(to);
  const [path, query = ""] = to.split("?");
  const q = new URLSearchParams(query.split("#")[0]);
  q.set("note", note);
  redirect(`${path}?${q.toString()}`);
}
const refresh = () => { revalidatePath("/friends"); revalidatePath("/home"); revalidatePath("/members", "layout"); };

/** Ask to be Friends. If they already asked you, this accepts their request instead. */
export async function sendFriendRequest(fd: FormData) {
  const { supabase, user } = await requireUser("/friends");
  const other = uuid(s(fd.get("member_id"), 40));
  if (!other || other === user.id) back(fd);
  const { error } = await supabase.from("friendships").insert({ requester_id: user.id, addressee_id: other });
  if (error && postErrorCode(error.message) === "request_exists") {
    await supabase.from("friendships").update({ status: "accepted" }).eq("requester_id", other).eq("addressee_id", user.id);
    refresh(); back(fd, "friends");
  }
  refresh();
  back(fd, error ? postErrorCode(error.message) : "request-sent");
}

export async function acceptFriend(fd: FormData) {
  const { supabase, user } = await requireUser("/friends");
  const other = uuid(s(fd.get("member_id"), 40));
  if (other) await supabase.from("friendships").update({ status: "accepted" }).eq("requester_id", other).eq("addressee_id", user.id);
  refresh();
  back(fd, "friends");
}

/** Decline a request, cancel your own request, or unfriend: all remove the pair's row. */
export async function removeFriend(fd: FormData) {
  const { supabase, user } = await requireUser("/friends");
  const other = uuid(s(fd.get("member_id"), 40));
  if (other) await supabase.from("friendships").delete().or(`and(requester_id.eq.${user.id},addressee_id.eq.${other}),and(requester_id.eq.${other},addressee_id.eq.${user.id})`);
  refresh();
  back(fd, s(fd.get("what"), 20) || "removed");
}

export async function setMute(fd: FormData) {
  const { supabase, user } = await requireUser("/friends");
  const other = uuid(s(fd.get("member_id"), 40));
  if (other && other !== user.id) {
    if (fd.get("on") === "1") await supabase.from("member_mutes").upsert({ muter_id: user.id, muted_id: other }, { onConflict: "muter_id,muted_id", ignoreDuplicates: true });
    else await supabase.from("member_mutes").delete().eq("muter_id", user.id).eq("muted_id", other);
  }
  refresh();
  back(fd, fd.get("on") === "1" ? "muted" : "unmuted");
}

/** Block also ends any friendship, request and follow between the two (done by the database). Asked twice in the page. */
export async function setBlock(fd: FormData) {
  const { supabase, user } = await requireUser("/friends");
  const other = uuid(s(fd.get("member_id"), 40));
  if (other && other !== user.id) {
    if (fd.get("on") === "1") await supabase.from("member_blocks").upsert({ blocker_id: user.id, blocked_id: other }, { onConflict: "blocker_id,blocked_id", ignoreDuplicates: true });
    else await supabase.from("member_blocks").delete().eq("blocker_id", user.id).eq("blocked_id", other);
  }
  refresh();
  back(fd, fd.get("on") === "1" ? "blocked-done" : "unblocked");
}

/** Join a group. A group that isn't open yet (not a priority industry) is opened by its first member. */
export async function joinGroup(fd: FormData) {
  const { supabase } = await requireUser("/groups");
  const slug = s(fd.get("slug"), 80);
  if (!isGroupSlug(slug)) back(fd);
  const { error } = await supabase.rpc("join_group", { p_slug: slug });
  revalidatePath("/groups", "layout");
  back(fd, error ? postErrorCode(error.message) : "joined");
}

export async function leaveGroup(fd: FormData) {
  const { supabase, user } = await requireUser("/groups");
  const id = uuid(s(fd.get("group_id"), 40));
  if (id) await supabase.from("group_members").delete().eq("group_id", id).eq("user_id", user.id);
  revalidatePath("/groups", "layout");
  back(fd, "left");
}
