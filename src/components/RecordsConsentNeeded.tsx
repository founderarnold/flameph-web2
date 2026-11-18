import Link from "next/link";
import { Notice } from "@/components/ui";

/** Shown when the member keeps switch 2 ("Transaction records") off. Saying no never blocks other member features. */
export function ConsentNeeded() {
  return (
    <Notice tone="info">
      To send requests, quotes and records, turn on switch 2, <strong>&ldquo;Transaction records&rdquo;</strong>, in{" "}
      <Link href="/account/settings#consents" className="font-semibold text-primary underline">Settings</Link>. It lets you create and confirm records with other members and shows your confirmed record count on your profile. You can turn it off any time.
    </Notice>
  );
}
