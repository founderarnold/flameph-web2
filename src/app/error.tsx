"use client";
import Link from "next/link";
import { useEffect } from "react";
import { reportError } from "@/components/SiteMonitor";

/** Shown when a page fails to load. The error is reported (anonymously) so the FLAME PH team sees it on Admin → Release. */
export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => { reportError(error); }, [error]);
  return (
    <section className="container-x py-12">
      <div className="card mx-auto max-w-md space-y-3 p-6 text-center">
        <h1 className="text-2xl font-extrabold text-primary">Something went wrong</h1>
        <p className="text-muted">This page didn&apos;t load properly. Please try again. Nagka-problema ang page na ito; pakisubukan ulit.</p>
        <div className="flex flex-wrap justify-center gap-2">
          <button onClick={reset} className="btn btn-primary min-h-11">Try again</button>
          <Link href="/" className="btn btn-outline min-h-11">Go to Home</Link>
        </div>
      </div>
    </section>
  );
}
