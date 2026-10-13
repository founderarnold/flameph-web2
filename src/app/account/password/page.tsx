import { requireUser } from "@/lib/auth";
import { meta } from "@/lib/meta";
import { PasswordForm } from "@/components/PasswordForm";

export const metadata = { ...meta("Set your password", "Set or change your FLAME PH password.", "/account/password"), robots: { index: false } };

export default async function Page() {
  await requireUser("/account/password");
  return (
    <section className="container-x py-10">
      <div className="mx-auto max-w-md">
        <h1 className="text-3xl font-extrabold text-primary">Set your password</h1>
        <p className="mt-2 text-muted">Next time, log in with your email and this password.</p>
        <div className="card mt-6 p-5"><PasswordForm /></div>
      </div>
    </section>
  );
}
