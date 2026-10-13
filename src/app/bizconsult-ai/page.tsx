import Link from "next/link";
import { PageHero, Section, Notice } from "@/components/ui";
import { KaFlameChat } from "@/components/KaFlameChat";
import { getSettings } from "@/lib/settings";
import { getSession } from "@/lib/auth";
import { meta } from "@/lib/meta";

export const metadata = meta("Biz Consult with FLAME AI", "Biz Consult with FLAME AI: a free Taglish business assistant for FLAME PH members. Ask about starting, registering, pricing and growing your negosyo.", "/bizconsult-ai");

export default async function Page() {
  const [s, { user }] = await Promise.all([getSettings(), getSession()]);
  return (
    <>
      <PageHero status="beta" fil="Ang AI kasama mo sa negosyo" title="Biz Consult with FLAME AI" path="/bizconsult-ai"
        intro={<>Ask in Taglish, English or Filipino. Free for FLAME PH members, with {s.ai_limits?.free ?? 10} questions a day.</>} />
      <Section>
        {user ? (
          <>
            <div className="mb-4"><Notice>FLAME AI can make mistakes. Always double-check important decisions. It is an AI guide, not a lawyer or accountant.</Notice></div>
            <KaFlameChat />
          </>
        ) : (
          <div className="card mx-auto max-w-xl p-6 text-center">
            <h2 className="text-xl font-extrabold">Members only, and free to join</h2>
            <p className="mt-2 text-muted">Sign up or log in to ask FLAME AI about starting, registering, pricing and growing your business.</p>
            <div className="mt-5 flex flex-wrap justify-center gap-3">
              <Link href="/join?next=/bizconsult-ai" className="btn btn-flame">Join free</Link>
              <Link href="/login?next=/bizconsult-ai" className="btn btn-outline">Log in</Link>
            </div>
          </div>
        )}
      </Section>
    </>
  );
}
