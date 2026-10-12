import { PageHero, Section, Notice } from "@/components/ui";
import { ProductGrid, type Product } from "@/components/ProductGrid";
import { SubmissionForm } from "@/components/SubmissionForm";
import { FORMS } from "@/lib/forms";
import { list } from "@/lib/content";
import { getSettings } from "@/lib/settings";
import { meta } from "@/lib/meta";

export const metadata = meta("FLAME PH Merchs", "FLAME PH merchandise: ID, lace, car decal, cap, mug, polo and jacket. Inquire via Messenger.", "/merch");

export default async function Page() {
  const [items, settings] = await Promise.all([list<Product>({ table: "merch_products", filters: { kind: "merch" }, order: "sort", ascending: true }), getSettings()]);
  const messenger = settings.social_links?.messenger ?? null;
  return (
    <>
      <PageHero status={items.length ? "live" : "soon"} fil="Suportahan ang FLAME PH" title="FLAME PH Merchs" path="/merch"
        intro="Wear the movement. Planned items include the FLAME PH ID, lace, car decal, cap, mug, polo and jacket." />
      <Section>
        <Notice>No online payment on this website. Orders are arranged directly with the FLAME PH team.</Notice>
        <div className="mt-6"><ProductGrid items={items} messenger={messenger} empty={{ title: "Inihahanda pa ang merch catalog.", text: "Send an inquiry and we'll tell you when items are available." }} /></div>
      </Section>
      <Section><div className="max-w-xl"><SubmissionForm def={FORMS["merch-inquiry"]} /></div></Section>
    </>
  );
}
