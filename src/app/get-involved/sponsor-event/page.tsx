import { InvolvedTemplate } from "@/components/InvolvedTemplate";
import { getInvolved } from "@/content/involved";
import { meta } from "@/lib/meta";

const page = getInvolved("sponsor-event");
export const metadata = meta(page.title, page.description, "/get-involved/sponsor-event");

export default function Page() {
  return <InvolvedTemplate page={page} />;
}
