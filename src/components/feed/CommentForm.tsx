"use client";
import { useActionState } from "react";
import { addComment, type FormState } from "@/app/account/feed-actions";
import { SubmitButton } from "@/components/SubmitButton";
import { COMMENT_MAX } from "@/lib/feed-rules";

/** Write a comment. On success the page comes back scrolled to the post; on a problem the text stays and the reason is shown. */
export function CommentForm({ postId, back, label = "Write a comment" }: { postId: string; back: string; label?: string }) {
  const [state, action] = useActionState<FormState, FormData>(addComment, {});
  const id = `c-${postId}`;
  return (
    <form action={action} className="mt-2">
      <input type="hidden" name="post_id" value={postId} />
      <input type="hidden" name="back" value={back} />
      <label htmlFor={id} className="sr-only">{label}</label>
      <div className="flex items-end gap-2">
        <textarea id={id} name="body" rows={1} maxLength={COMMENT_MAX} required placeholder={`${label}…`} defaultValue={state.values?.body}
          aria-invalid={state.error ? true : undefined} aria-describedby={state.error ? `${id}-err` : undefined}
          className="input min-h-11 flex-1 resize-y py-2 text-[15px]" />
        <SubmitButton className="btn btn-primary min-h-11 px-4 text-sm" pendingText="Sending…">Send</SubmitButton>
      </div>
      {state.error && <p id={`${id}-err`} role="alert" className="mt-1 text-sm text-danger">{state.error}</p>}
    </form>
  );
}
