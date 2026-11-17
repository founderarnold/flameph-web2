import { joinGroup, leaveGroup } from "@/app/account/people-actions";

/** Join (or start) a group, or leave it. A plain form, so it works before the page's JavaScript loads. */
export function JoinLeave({ slug, groupId, member, name, back, label = "Join" }: { slug: string; groupId?: string; member: boolean; name: string; back: string; label?: string }) {
  return member && groupId ? (
    <form action={leaveGroup}>
      <input type="hidden" name="group_id" value={groupId} /><input type="hidden" name="back" value={back} />
      <button className="btn btn-outline min-h-11 px-3 text-sm" aria-label={`Leave ${name}`}>Leave</button>
    </form>
  ) : (
    <form action={joinGroup}>
      <input type="hidden" name="slug" value={slug} /><input type="hidden" name="back" value={back} />
      <button className="btn btn-primary min-h-11 px-3 text-sm" aria-label={`${label} ${name}`}>{label}</button>
    </form>
  );
}
