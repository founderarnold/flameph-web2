// FLAME POS is its own app (pos.flameph.org, repo founderarnold/flame-pos, its own database). flameph.org only opens it.
// Every link goes through the FLAME PH sign-in hub on this same site (/sso/authorize), so a member who is already
// signed in here lands in FLAME POS signed in, without typing a password again. The link is relative on purpose:
// it stays on the address the member is using (flameph.org or www.flameph.org), where their sign-in lives.

export const POS_ORIGIN = "https://pos.flameph.org";

/** Places inside FLAME POS a member can open directly. FLAME POS itself checks the business and the member's role. */
export const POS_PLACES = [
  { path: "/organizations", title: "Open FLAME POS", text: "Your business, or set one up the first time." },
  { path: "/pos", title: "Sell", text: "Checkout: cash, GCash, Maya, card." },
  { path: "/sales", title: "Sales and receipts", text: "Today's sales and past receipts." },
  { path: "/products", title: "Products", text: "Items, prices and barcodes." },
  { path: "/inventory", title: "Stock", text: "Stock levels and low-stock items." },
  { path: "/?view=reports", title: "Reports", text: "Sales, expenses and gross profit." },
] as const;

export type PosPath = (typeof POS_PLACES)[number]["path"];

/** Opens FLAME POS at `path`, signed in with the member's FLAME PH account. */
export const posHref = (path: PosPath = "/organizations") =>
  `/sso/authorize?client=flamepos&return=${encodeURIComponent(POS_ORIGIN + path)}`;

/** FLAME POS's own sign-in, for cashiers and staff who use a POS-only account. */
export const POS_STAFF_LOGIN = `${POS_ORIGIN}/login`;
