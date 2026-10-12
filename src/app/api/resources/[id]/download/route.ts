import { NextResponse } from "next/server";
import { createAdminClient, createClient } from "@/lib/supabase/server";

// Logs a real download, then sends the visitor to the file.
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const admin = createAdminClient();
  if (!admin) return NextResponse.redirect(new URL("/resources", req.url));
  const { data: r } = await admin.from("resources").select("id, file_path, external_url, published").eq("id", id).single();
  if (!r || !r.published) return NextResponse.redirect(new URL("/resources", req.url));
  const supabase = await createClient();
  const userId = supabase ? (await supabase.auth.getUser()).data.user?.id ?? null : null;
  await admin.from("resource_downloads").insert({ resource_id: r.id, user_id: userId });
  if (r.external_url) return NextResponse.redirect(r.external_url);
  const { data } = admin.storage.from("media").getPublicUrl(r.file_path!);
  return NextResponse.redirect(data.publicUrl);
}
