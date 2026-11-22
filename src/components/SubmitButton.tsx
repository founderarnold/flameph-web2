"use client";
import { useFormStatus } from "react-dom";

/** Submit button that shows it is working ("Saving…") and can't be pressed twice while the form is sent. */
export function SubmitButton({ children, pendingText = "Saving…", className = "btn btn-primary btn-ds", disabled, name, value }: { children: React.ReactNode; pendingText?: string; className?: string; disabled?: boolean; name?: string; value?: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" name={name} value={value} className={className} disabled={disabled || pending} aria-busy={pending || undefined}>
      {pending ? <><span className="btn-spinner" aria-hidden /> {pendingText}</> : children}
    </button>
  );
}
