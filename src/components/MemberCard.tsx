import QRCode from "qrcode";
import { ORG } from "@/lib/site";

export async function MemberCard({ name, code, since, tier, status }: { name: string; code: string; since: string; tier: string; status: string }) {
  const verifyUrl = `${ORG.url}/verify/${code}`;
  const qr = await QRCode.toString(verifyUrl, { type: "svg", margin: 0, color: { dark: "#003289", light: "#ffffff" } });
  return (
    <figure className="w-full max-w-sm overflow-hidden rounded-2xl border border-line bg-white text-[#14161c] shadow-lg" aria-label="FLAME PH digital member ID">
      <div className="flex items-center justify-between bg-[#003289] px-4 py-3">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/brand/flameph-logo-320.webp" alt="FLAME PH" className="h-8 w-auto rounded bg-white px-1" />
        <span className="text-xs font-bold uppercase tracking-wider text-white">Member ID</span>
      </div>
      <div className="grid grid-cols-[1fr_96px] gap-3 p-4">
        <div className="min-w-0">
          <p className="text-xs uppercase text-[#4b5262]">Name</p>
          <p className="truncate text-lg font-extrabold">{name || "Complete your profile"}</p>
          <p className="mt-2 text-xs uppercase text-[#4b5262]">Member ID</p>
          <p className="font-mono font-bold">{code}</p>
          <div className="mt-2 flex gap-4 text-sm">
            <div><p className="text-xs uppercase text-[#4b5262]">Since</p><p className="font-semibold">{new Date(since).toLocaleDateString("en-PH", { month: "short", year: "numeric" })}</p></div>
            <div><p className="text-xs uppercase text-[#4b5262]">Tier</p><p className="font-semibold capitalize">{tier}</p></div>
            <div><p className="text-xs uppercase text-[#4b5262]">Status</p><p className="font-semibold capitalize">{status}</p></div>
          </div>
        </div>
        <div className="self-center" dangerouslySetInnerHTML={{ __html: qr }} aria-label="QR code to verify this ID" role="img" />
      </div>
      <figcaption className="h-2 bg-gradient-to-r from-[#e8501a] via-[#f5b31a] to-[#d4000f]" />
    </figure>
  );
}
