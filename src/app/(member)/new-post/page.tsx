import { requireUser } from "@/lib/auth";
import { INDUSTRY_NAMES } from "@/lib/industries";
import { isPostKind } from "@/lib/feed-rules";
import { Composer } from "@/components/feed/Composer";
import { Notice } from "@/components/ui";
import { JoinLeave } from "@/components/people/JoinLeave";
import { getGroup } from "@/lib/groups-data";
import { isGroupSlug } from "@/lib/groups";

export const metadata = { title: "New Post" };

/** New Post tab: opens the composer directly. Publishing returns the member to the Home feed, scrolled to the new post. */
export default async function NewPostTab({ searchParams }: { searchParams: Promise<{ kind?: string; industry?: string; group?: string }> }) {
  const { supabase, user } = await requireUser("/new-post");
  const sp = await searchParams;
  const [{ data: p }, { data: biz }, friendsCheck, found] = await Promise.all([
    supabase.from("profiles").select("*").eq("id", user.id).single(),
    supabase.from("businesses").select("sector, subsector").eq("owner_id", user.id).limit(1).maybeSingle(),
    supabase.from("friendships").select("status", { count: "exact", head: true }).limit(1),
    isGroupSlug(sp.group) ? getGroup(supabase, sp.group, user.id) : Promise.resolve(null),
  ]);
  const group = found?.group ? { slug: found.group.slug, name: found.group.name } : null;
  // Start on the industry the member works in: the one asked for, their business's, or the first they picked.
  const picked = [sp.industry, biz?.sector, ...((p?.industries as string[] | undefined) ?? [])].find((x) => x && INDUSTRY_NAMES.includes(x));
  const category = picked ? (picked === biz?.sector && biz?.subsector ? `${picked}||${biz.subsector}` : picked) : "";
  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="text-2xl font-extrabold">New Post</h1>
      <p className="mb-4 text-muted"><span lang="fil">Ibahagi sa komunidad.</span> Your post appears in the Home feed and the forum.</p>
      {group && !found?.member && (
        <div className="mb-4 space-y-2"><Notice tone="info">Join {group.name} first, then you can post in it.</Notice>
          <JoinLeave slug={group.slug} member={false} name={group.name} back={`/new-post?group=${group.slug}`} /></div>
      )}
      <div className="card p-4 sm:p-5">
        <Composer kind={isPostKind(sp.kind) ? sp.kind : "update"} category={category} group={group && found?.member ? group : null} friendsAvailable={!friendsCheck.error} />
      </div>
    </div>
  );
}
