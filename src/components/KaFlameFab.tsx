"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

// Floating Ka-FLAME button for signed-in members (desktop; mobile has the bottom bar).
export function KaFlameFab() {
  const p = usePathname();
  if (p.startsWith("/bizconsult-ai") || p.startsWith("/admin")) return null;
  return (
    <Link href="/bizconsult-ai" className="btn btn-flame fixed bottom-6 right-6 z-30 hidden rounded-full shadow-lg lg:inline-flex" aria-label="Open Biz Consult with FLAME AI">
      💬 FLAME AI
    </Link>
  );
}
