import Link from "next/link";
import { AuthForm } from "@/components/AuthForm";
import { meta } from "@/lib/meta";

export const metadata = meta("Log in", "Log in to your FLAME PH member account.", "/login");

export default async function Page({ searchParams }: { searchParams: Promise<{ next?: string; error?: string }> }) {
  const { next, error } = await searchParams;
  return (
    <section className="container-x py-10">
      <div className="mx-auto max-w-md">
        <h1 className="text-3xl font-extrabold text-primary">Log in</h1>
        {error && <p role="alert" className="mt-3 rounded-lg bg-warn-soft p-3 text-warn">That link didn&apos;t open here. No problem: type the 6-digit code from the same email below, or ask for a new one.</p>}
        <div className="card mt-6 p-5"><AuthForm mode="login" next={next?.startsWith("/") ? next : "/account"} haveCode={!!error} /></div>
        <p className="mt-4 text-center">New here? <Link href="/join" className="font-semibold text-mph underline">Join free</Link></p>
      </div>
    </section>
  );
}
