"use client";
import { createContext, useContext, useState, useTransition } from "react";
import { setFollow, toggleFollow } from "@/app/account/onboarding-actions";

/** Running "You follow N" count for a page of Follow buttons, so it changes the moment a button is pressed. */
const FollowCountContext = createContext<((delta: number) => void) | null>(null);

export function FollowCountProvider({ initial, children }: { initial: number; children: React.ReactNode }) {
  const [n, setN] = useState(initial);
  return (
    <FollowCountContext.Provider value={(d) => setN((x) => Math.max(0, x + d))}>
      <FollowCountValue.Provider value={n}>{children}</FollowCountValue.Provider>
    </FollowCountContext.Provider>
  );
}
const FollowCountValue = createContext<number | null>(null);
export function FollowCount({ fallback }: { fallback: number }) {
  return <>{useContext(FollowCountValue) ?? fallback}</>;
}

/**
 * Follow / Following toggle. Turns into "Following" the moment it is pressed and saves in the background,
 * without reloading the page; it goes back and says so if saving fails. Before the page's JavaScript loads
 * it is a plain form, so it still works.
 */
export function FollowButton({ memberId, following, back, name }: { memberId: string; following: boolean; back: string; name: string }) {
  const [on, setOn] = useState(following);
  const [failed, setFailed] = useState(false);
  const [, start] = useTransition();
  const bump = useContext(FollowCountContext);

  function press(e: React.MouseEvent<HTMLButtonElement>) {
    e.preventDefault();
    const next = !on;
    setOn(next);
    setFailed(false);
    bump?.(next ? 1 : -1);
    start(async () => {
      let ok = false;
      try { ok = (await setFollow(memberId, next)).ok; } catch { ok = false; }
      if (!ok) { setOn(!next); setFailed(true); bump?.(next ? -1 : 1); }
    });
  }

  return (
    <form action={toggleFollow}>
      <input type="hidden" name="member_id" value={memberId} />
      <input type="hidden" name="back" value={back} />
      {on && <input type="hidden" name="unfollow" value="1" />}
      <button onClick={press} aria-pressed={on} aria-label={`${on ? "Unfollow" : "Follow"} ${name}`}
        className={`btn min-h-11 w-full px-3 text-sm ${on ? "btn-outline" : "btn-primary"}`}>
        {on ? "✓ Following" : "Follow"}
      </button>
      {failed && <p role="alert" className="mt-1 text-xs text-danger">Didn&apos;t save. Try again.</p>}
    </form>
  );
}
