import { InvolvedTemplate } from "@/components/InvolvedTemplate";
import { getInvolved } from "@/content/involved";
import { meta } from "@/lib/meta";

const page = getInvolved("nominate");
export const metadata = meta(page.title, page.description, "/get-involved/nominate");

export default function Page() {
  return <InvolvedTemplate page={page} />;
}
