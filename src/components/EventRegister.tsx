"use client";
import { useState } from "react";
import { SubmissionForm } from "./SubmissionForm";
import type { FormDef } from "@/lib/forms";

export function EventRegister({ def, eventId, title }: { def: FormDef; eventId: string; title: string }) {
  const [open, setOpen] = useState(false);
  if (!open) return <button type="button" className="btn btn-primary mt-4" onClick={() => setOpen(true)}>Register</button>;
  return <div className="mt-4"><SubmissionForm def={def} context={{ event_id: eventId }} title={`Register: ${title}`} compact /></div>;
}
