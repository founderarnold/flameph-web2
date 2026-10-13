import type { EmailOtpType } from "@supabase/supabase-js";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { meta } from "@/lib/meta";

export const metadata = { ...meta("Confirm your email", "Finish signing in to FLAME PH.", "/auth/confirm"), robots: { index: false } };

const safeNext = (n?: string | null) => (n?.startsWith("/") && !n.startsWith("//") ? n : "/account");

// Signs the visitor in from the link in our email. It works in any browser or app (Gmail, Facebook, another phone),
// unlike the old code link, which only worked in the browser that asked for it. Verifying happens on the button tap,
// not on page load, so email security scanners that open links in advance can't use up the one-time link.
async function confirm(form: FormData) {
  "use server";
  const token_hash = String(form.get("token_hash") || "");
  const type = (String(form.get("type") || "email") as EmailOtpType);
  const next = safeNext(String(form.get("next") || ""));
  const supabase = await createClient();
  if (!supabase || !token_hash) redirect("/login?error=1");
  const { error } = await supabase.auth.verifyOtp({ token_hash, type });
  if (error) {
    // Already signed in (for example, they typed the code first): just carry on.
    const { data } = await supabase.auth.getUser();
    redirect(data.user ? next : "/login?error=1");
  }
  redirect(next);
}

export default async function Page({ searchParams }: { searchParams: Promise<{ token_hash?: string; type?: string; next?: string }> }) {
  const { token_hash, type, next } = await searchParams;
  if (!token_hash) redirect("/login?error=1");
  return (
    <section className="container-x py-10">
      <div className="card mx-auto max-w-md p-6 text-center">
        <h1 className="text-2xl font-extrabold text-primary">Isang tap na lang!</h1>
        <p className="mt-2 text-muted">Tap the button to finish signing in to FLAME PH.</p>
        <form action={confirm} className="mt-6">
          <input type="hidden" name="token_hash" value={token_hash} />
          <input type="hidden" name="type" value={type || "email"} />
          <input type="hidden" name="next" value={safeNext(next)} />
          <button className="btn btn-flame w-full text-lg">Continue to my account</button>
        </form>
      </div>
    </section>
  );
}
