import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { CALCULATOR_PAGES } from "@/calculators/pages.generated";

export const dynamic = "force-dynamic";

// Calculator pages are for signed-in members only, so they are served here instead of from /public.
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const id = (await params).id.replace(/\.html$/, "");
  const html = CALCULATOR_PAGES[id];
  if (!html) return new NextResponse("Not found", { status: 404 });

  const supabase = await createClient();
  const user = supabase ? (await supabase.auth.getUser()).data.user : null;
  if (!user) {
    const next = `/business-calculators?calc=${id}`;
    return NextResponse.redirect(new URL(`/login?next=${encodeURIComponent(next)}`, request.url));
  }

  return new NextResponse(html, {
    headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "private, no-store" },
  });
}
