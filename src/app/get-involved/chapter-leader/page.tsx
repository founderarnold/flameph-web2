import { permanentRedirect } from "next/navigation";

// One Chapter Builder page (owner, 22 Nov 2026): the old Chapter Leader page forwards there, so old links keep working.
export default function Page() {
  permanentRedirect("/get-involved/chapter-builder#builder");
}
