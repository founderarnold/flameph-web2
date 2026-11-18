// Fulfillment tab (bottom tab 2), on the existing Fulfillment by MSMEs feature: member offers (feed posts of the
// "Fulfillment offer" kind), fulfillment requests (the existing requests, titled "Fulfillment: ..."), the partner
// application, and Fulfillment by MSMEs on NegosyoDepot. Pure rules shared by the page, its action and the tests.

export const FULFILLMENT_PREFIX = "Fulfillment: ";

export const FULFILLMENT_TYPES = {
  produce: "Produce or make",
  pack: "Pack or label",
  store: "Store and receive stock",
  deliver: "Deliver to customers",
} as const;
export type FulfillmentType = keyof typeof FULFILLMENT_TYPES;

/** The request title members and suppliers see, e.g. "Fulfillment: Pack or label · 300 gift boxes". */
export function fulfillmentTitle(type: string, what: string) {
  const t = FULFILLMENT_TYPES[type as FulfillmentType];
  const w = what.trim().replace(/\s+/g, " ");
  if (!t || w.length < 3) return null;
  return `${FULFILLMENT_PREFIX}${t} · ${w}`.slice(0, 120);
}

export const isFulfillmentRequest = (title: string) => title.startsWith(FULFILLMENT_PREFIX);

/** Fulfillment by MSMEs pages on NegosyoDepot (opened through /go). */
export const FULFILLMENT_LINKS: { to: string; label: string; text: string }[] = [
  { to: "/#/fulfillment/providers", label: "Find a local provider", text: "Chapter leaders and members who receive, store, pack and dispatch near your customers." },
  { to: "/#/fulfillment/cost-estimator", label: "Estimate your fulfillment cost", text: "A quick cost estimate before you ask for quotes." },
  { to: "/#/fulfillment/provider-register", label: "Join the provider network", text: "List your space, packing or delivery capacity." },
  { to: "/#/fulfillment", label: "How Fulfillment by MSMEs works", text: "Models, service terms and guides." },
];
