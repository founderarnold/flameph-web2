import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { allowedReturn } from "@/lib/sso";

/** Another FLAME PH site logged the visitor out, so log them out here too.  GET /sso/logout?client=…&return=… */
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const back = allowedReturn(sp.get("client") ?? "", sp.get("return"));
  const supabase = await createClient();
  await supabase?.auth.signOut();
  return NextResponse.redirect(back ?? new URL("/", req.url), { headers: { "Cache-Control": "no-store" } });
}
