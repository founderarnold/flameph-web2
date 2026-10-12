import Link from "next/link";
import { AuthForm } from "@/components/AuthForm";
import { meta } from "@/lib/meta";

export const metadata = meta("Join free", "Become a free FLAME PH member with Google or your email.", "/join");

export default async function Page({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  return (
    <section className="container-x py-10">
      <div className="mx-auto max-w-md">
        <p className="font-display font-bold text-flame-strong">Libre ang pagsali</p>
        <h1 className="text-3xl font-extrabold text-primary">Join FLAME PH</h1>
        <p className="mt-2 text-muted">Get your member ID, list your business and use Ka-FLAME AI. Free.</p>
        <div className="card mt-6 p-5"><AuthForm mode="join" next={next?.startsWith("/") ? next : "/account/profile?welcome=1"} /></div>
        <p className="mt-4 text-center">Already a member? <Link href="/login" className="font-semibold text-mph underline">Log in</Link></p>
      </div>
    </section>
  );
}
