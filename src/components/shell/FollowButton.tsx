"use client";

import { useState, useTransition } from "react";
import { setFollow, toggleFollow } from "@/app/account/onboarding-actions";

/**
 * Follow / Following toggle. Tapping switches the label at once, then saves in the background (no page reload).
 * If saving fails, it switches back and says so. Without JavaScript it is still a plain form (toggleFollow).
 */
export function FollowButton({ memberId, following, back, name }: { memberId: string; following: boolean; back: string; name: string }) {
  const [on, setOn] = useState(following);
  const [error, setError] = useState(false);
  const [, start] = useTransition();
  return (
    <form action={toggleFollow} onSubmit={(e) => {
      e.preventDefault();
      const next = !on;
      setOn(next);
      setError(false);
      start(async () => {
        const res = await setFollow(memberId, next).catch(() => ({ ok: false }));
        if (!res.ok) { setOn(!next); setError(true); return; }
      });
    }}>
      <input type="hidden" name="member_id" value={memberId} />
      <input type="hidden" name="back" value={back} />
      {on && <input type="hidden" name="unfollow" value="1" />}
      <button aria-pressed={on} aria-label={`${on ? "Unfollow" : "Follow"} ${name}`}
        className={`btn min-h-11 w-full px-3 text-sm ${on ? "btn-outline" : "btn-primary"}`}>
        {on ? "✓ Following" : "Follow"}
      </button>
      {error && <span role="alert" className="mt-1 block text-xs text-danger">Couldn&apos;t save. Try again.</span>}
    </form>
  );
}
