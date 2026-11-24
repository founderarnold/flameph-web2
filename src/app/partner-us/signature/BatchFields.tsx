import { Select, Text, TextArea } from "@/components/PartnerFields";
import { BATCH_TYPES, QC_RESULT, type BatchRow } from "@/lib/signature";

export type Prod = { id: string; product_name: string; net_content: string; site_id: string | null; approval: string; shelf_life_months: number; offer_id: string };
export type Site = { id: string; site_name: string; offer_id: string };

/** The batch form fields, shared by "Record a batch" and the batch page. */
export function BatchFields({ products, sites, b }: { products: Prod[]; sites: Site[]; b?: BatchRow }) {
  return (
    <>
      <Select name="product_id" label="Product" value={b?.product_id ?? null} need options={products.map((p) => [p.id, `${p.product_name} (${p.net_content})${p.approval === "approved" ? "" : " · not yet approved"}`])} />
      <Select name="site_id" label="Plant where it was made" value={b?.site_id ?? null} options={sites.map((s) => [s.id, s.site_name])} help="Leave on Choose… to use the product's own plant." />
      <Select name="batch_type" label="Kind of batch" value={b?.batch_type ?? null} need options={Object.entries(BATCH_TYPES).map(([k, v]) => [k, v.label])}
        help="Sample and pilot batches are for testing only. A production batch is for sale and needs an active licence for the product and plant." />
      <div className="grid gap-4 sm:grid-cols-2">
        <Text name="lot_no" label="Lot or batch number (as printed)" value={b?.lot_no} need max={60} />
        <Text name="quantity" label="Quantity made" value={b?.quantity} need max={12} inputMode="numeric" />
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <Text name="unit" label="Unit" value={b?.unit ?? "pieces"} need max={30} />
        <Text name="produced_on" label="Date made" value={b?.produced_on} need type="date" max={10} />
        <Text name="expiry_on" label="Expiry date" value={b?.expiry_on} need type="date" max={10} />
      </div>
      <TextArea name="raw_material_lots" label="Lots of the ingredients and packaging used" value={b?.raw_material_lots} max={1000} rows={3}
        help="For traceability: if an ingredient has a problem, we can find every batch that used it." />
      <Select name="qc_result" label="Your own quality check" value={b?.qc_result ?? "pending"} options={Object.entries(QC_RESULT)} />
      <TextArea name="qc_note" label="Quality check notes (needed if it failed)" value={b?.qc_note} max={1000} rows={2} />
    </>
  );
}
