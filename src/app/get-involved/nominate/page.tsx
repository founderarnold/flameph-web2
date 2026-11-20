import { InvolvedTemplate } from "@/components/InvolvedTemplate";
import { getInvolved } from "@/content/involved";
import { meta } from "@/lib/meta";

const page = getInvolved("nominate");
export const metadata = meta(page.title, page.description, "/get-involved/nominate");

export default async function Page({ searchParams }: { searchParams: Promise<{ award?: string }> }) {
  const { award } = await searchParams;
  return <InvolvedTemplate page={page} defaults={award ? { award } : undefined} />;
}
