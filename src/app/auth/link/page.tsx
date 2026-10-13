export const metadata = { title: "Signing you in", robots: { index: false } };

/** Where sign-in email links land. EmailLinkSignIn (in the layout) finishes the sign-in. */
export default function Page() {
  return (
    <section className="container-x py-16 text-center">
      <p className="text-lg font-semibold text-primary">Signing you in…</p>
      <noscript><p className="mt-2 text-muted">Please turn on JavaScript, or log in with your password.</p></noscript>
    </section>
  );
}
