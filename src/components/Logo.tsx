import Image from "next/image";
import Link from "next/link";

export function Logo({ className = "", height = 44, priority = false, link = true }: { className?: string; height?: number; priority?: boolean; link?: boolean }) {
  const width = Math.round(height * 2.983);
  const img = (
    <Image
      src="/brand/flameph-logo.png"
      alt="FLAME PH — Federation of Leaders Advancing MSME Ecosystem in the Philippines"
      width={width}
      height={height}
      priority={priority}
      sizes={`${width}px`}
      className={className}
    />
  );
  return link ? <Link href="/" aria-label="FLAME PH home" className="inline-flex shrink-0">{img}</Link> : img;
}
