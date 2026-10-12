import { PageHero, Section, Grid, FeatureCard } from "@/components/ui";
import { INVOLVED } from "@/content/involved";
import { meta } from "@/lib/meta";

export const metadata = meta("Get Involved", "Eleven ways to help Filipino MSMEs with FLAME PH: mentor, partner, sponsor, volunteer and more.", "/get-involved");

export default function Page() {
  const cards = [...INVOLVED.slice(0, 6).map((p) => ({ title: p.title, text: p.intro, status: p.status, href: `/get-involved/${p.slug}` })),
    { title: "News & Updates", text: "Follow what FLAME PH is doing and share it with others.", status: "live" as const, href: "/news" },
    ...INVOLVED.slice(6).map((p) => ({ title: p.title, text: p.intro, status: p.status, href: `/get-involved/${p.slug}` }))];
  return (
    <>
      <PageHero status="live" fil="Makilahok" title="Get Involved" path="/get-involved" intro="Walang negosyanteng Pilipino ang dapat maging mag-isa. Here are eleven ways you can help." />
      <Section><Grid>{cards.map((c) => <FeatureCard key={c.href} {...c} />)}</Grid></Section>
    </>
  );
}
