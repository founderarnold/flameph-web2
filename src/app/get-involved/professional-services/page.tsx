import { InvolvedTemplate } from "@/components/InvolvedTemplate";
import { getInvolved } from "@/content/involved";
import { meta } from "@/lib/meta";

const page = getInvolved("professional-services");
export const metadata = meta(page.title, page.description, "/get-involved/professional-services");

export default function Page() {
  return <InvolvedTemplate page={page} />;
}
