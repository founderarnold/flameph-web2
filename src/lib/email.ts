import "server-only";
import { ORG } from "@/lib/site";

type Mail = { to: string | string[]; cc?: string[]; subject: string; text: string; replyTo?: string };

/** Sends email through Resend when RESEND_API_KEY is set. Never throws; returns false when not sent. */
export async function sendEmail(mail: Mail): Promise<boolean> {
  const key = process.env.RESEND_API_KEY;
  if (!key) return false;
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
      body: JSON.stringify({
        from: process.env.EMAIL_FROM || `FLAME PH <noreply@flameph.org>`,
        to: mail.to, cc: mail.cc, subject: mail.subject, text: mail.text, reply_to: mail.replyTo,
      }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export const NOTIFY_TO = process.env.NOTIFY_EMAIL || ORG.emailPrimary;
export const REAL_ESTATE_NOTIFY_TO = process.env.REAL_ESTATE_ADMIN_EMAIL || NOTIFY_TO;
export const PARTNER_CC = ORG.emailPartnerships;
