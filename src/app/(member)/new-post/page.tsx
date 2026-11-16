import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { TabShell, BackToFeed } from "@/components/shell/TabShell";

export const metadata = { title: "New Post" };

/** New Post tab. A shell in this phase; posting arrives in Phase 4 and will return the member to the feed, scrolled to the new post. */
export default async function NewPostTab() {
  await requireUser("/new-post");
  return (
    <TabShell title="New Post" fil="Ibahagi sa komunidad" soon="Posting opens in the next update"
      intro="Soon you can share an update, a product, a question or a request with other FLAME PH members. Your post will appear in your Home feed.">
      <div className="card space-y-3 p-5">
        <p className="font-semibold">While you wait, you can:</p>
        <ul className="list-disc space-y-1 pl-5 text-[15px]">
          <li><Link href="/account/business" className="text-primary underline">Update your business page</Link></li>
          <li><Link href="/opportunities" className="text-primary underline">Look at opportunities</Link></li>
          <li><Link href="/bizconsult-ai" className="text-primary underline">Ask Ka-FLAME AI</Link></li>
        </ul>
      </div>
      <BackToFeed />
    </TabShell>
  );
}
