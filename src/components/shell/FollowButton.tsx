import { toggleFollow } from "@/app/account/onboarding-actions";

/** Follow / Following toggle. A plain form, so it works before the page's JavaScript loads. */
export function FollowButton({ memberId, following, back, name }: { memberId: string; following: boolean; back: string; name: string }) {
  return (
    <form action={toggleFollow}>
      <input type="hidden" name="member_id" value={memberId} />
      <input type="hidden" name="back" value={back} />
      {following && <input type="hidden" name="unfollow" value="1" />}
      <button aria-pressed={following} aria-label={`${following ? "Unfollow" : "Follow"} ${name}`}
        className={`btn min-h-11 w-full px-3 text-sm ${following ? "btn-outline" : "btn-primary"}`}>
        {following ? "✓ Following" : "Follow"}
      </button>
    </form>
  );
}
