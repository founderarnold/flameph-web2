import { PageHero, Section, Notice } from "@/components/ui";
import { KaFlameChat } from "@/components/KaFlameChat";
import { getSettings } from "@/lib/settings";
import { meta } from "@/lib/meta";

export const metadata = meta("FLAME PH BizConsult AI (Ka-FLAME AI)", "Ka-FLAME AI: a free Taglish business assistant for Filipino MSMEs. Ask about starting, registering, pricing and growing your negosyo.", "/bizconsult-ai");

export default async function Page() {
  const s = await getSettings();
  return (
    <>
      <PageHero status="beta" fil="Ang AI kasama mo sa negosyo" title="Ka-FLAME AI" path="/bizconsult-ai"
        intro={<>FLAME PH BizConsult AI. Ask in Taglish, English or Filipino. Guests get {s.ai_limits?.guest ?? 3} free questions a day; free members get {s.ai_limits?.free ?? 10}.</>} />
      <Section>
        <div className="mb-4"><Notice>Ka-FLAME AI can make mistakes. Always double-check important decisions. It is an AI guide, not a lawyer or accountant.</Notice></div>
        <KaFlameChat />
      </Section>
    </>
  );
}
