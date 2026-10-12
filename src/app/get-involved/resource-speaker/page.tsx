import { InvolvedTemplate } from "@/components/InvolvedTemplate";
import { getInvolved } from "@/content/involved";
import { meta } from "@/lib/meta";

const page = getInvolved("resource-speaker");
export const metadata = meta(page.title, page.description, "/get-involved/resource-speaker");

export default function Page() {
  return <InvolvedTemplate page={page} />;
}
