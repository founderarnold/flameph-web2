import Link from "next/link";
import { PageHero, Section } from "@/components/ui";
import { ProductGrid, type Product } from "@/components/ProductGrid";
import { list } from "@/lib/content";
import { meta } from "@/lib/meta";

export const metadata = meta("Flame Signature Brands", "Member-made products carried under the FLAME PH name.", "/signature-brands");

export default async function Page() {
  const items = await list<Product>({ table: "merch_products", filters: { kind: "signature_brand" }, order: "sort", ascending: true });
  return (
    <>
      <PageHero status={items.length ? "live" : "soon"} fil="Gawang miyembro" title="Flame Signature Brands" path="/signature-brands"
        intro="A planned line of quality products made by FLAME PH member MSMEs and carried under the FLAME PH name." />
      <Section>
        <ProductGrid items={items} empty={{ title: "Wala pang Signature Brand products.", text: "Are you a member who makes quality products? Tell us about them.", cta: { href: "/fulfillment", label: "Apply as a maker" } }} />
        <p className="mt-6 text-muted">Looking to sell now? Members can list products on <Link href="https://www.marketplaceph.com" className="text-mph underline">MarketplacePH ↗</Link>.</p>
      </Section>
    </>
  );
}
