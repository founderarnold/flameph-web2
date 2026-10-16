import { meta } from "@/lib/meta";
import RideSafeHome from "./RideSafeHome";

export const metadata = meta(
  "FLAME PH RideSafe",
  "Find roadside help, drive safer, and plan smarter trips on Philippine roads.",
  "/ridesafe",
);

export default function RideSafePage() {
  return <RideSafeHome />;
}
