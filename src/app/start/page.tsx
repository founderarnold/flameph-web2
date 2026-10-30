import { EcosystemFrontDoor } from "@/components/EcosystemFrontDoor";
import { meta } from "@/lib/meta";

export const metadata = meta("Ano Ang Gusto Mong Gawin Ngayon For Your Business?", "Choose a business goal and FLAME PH will route you to the right service in its MSME ecosystem.", "/start");

export default function StartPage() {
  return <EcosystemFrontDoor />;
}
