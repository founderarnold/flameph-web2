import Link from "next/link";

export const dynamic = "force-static";
export const metadata = { title: "Offline" };

export default function Offline() {
  return (
    <section className="container-x py-20 text-center">
      <h1 className="text-2xl font-extrabold">Offline ka yata.</h1>
      <p className="mt-2 text-muted">Walang internet connection ngayon. Any form you were filling in is saved on this phone. Try again when you&apos;re back online.</p>
      <Link href="/" className="btn btn-primary mt-6">Try again</Link>
    </section>
  );
}
