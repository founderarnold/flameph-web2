import { InvolvedTemplate } from "@/components/InvolvedTemplate";
import { getInvolved } from "@/content/involved";
import { meta } from "@/lib/meta";

const page = getInvolved("affiliate");
export const metadata = meta(page.title, page.description, "/get-involved/affiliate");

export default function Page() {
  return <InvolvedTemplate page={page} />;
}
