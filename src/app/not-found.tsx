import Link from "next/link";

export default function NotFound() {
  return (
    <section className="container-x py-20 text-center">
      <p className="font-display text-6xl font-extrabold text-flame">404</p>
      <h1 className="mt-2 text-2xl font-extrabold">Naku, wala dito ang hinahanap mo.</h1>
      <p className="mt-2 text-muted">The page may have moved. Balik tayo sa simula.</p>
      <div className="mt-6 flex justify-center gap-3"><Link href="/" className="btn btn-primary">Go home</Link><Link href="/contact" className="btn btn-outline">Contact us</Link></div>
    </section>
  );
}
