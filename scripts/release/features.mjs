// Phase 13: the preserved features of flameph.org, named one by one, with the page(s) that prove each still works.
// Used by scripts/release/regression.mjs (live check) and tests/phase-13.test.mjs (every route here must exist).
//
// path      the address to open
// expect    "ok" (page loads, 200) | "login" (signed-out visitors are sent to /login) | "member" (only with the test member)
// marker    a CSS selector that must be on the page (proves the feature rendered, not just an empty 200)
// count     with marker: how many must be there at least

export const CALCULATORS = [
  "markup-margin", "break-even", "roi", "job-service-pricing", "cash-flow", "working-capital", "receivables-aging",
  "inventory-turnover", "fleet-cost", "capacity-planning", "employee-cost", "payroll", "expansion-readiness",
  "franchise-unit-economics", "customer-acquisition-cost",
];

export const FEATURES = [
  { name: "28 goal cards (home page)", pages: [{ path: "/?view=public", marker: "#choose-a-goal .grid > a", count: 28 }], goalCards: true },
  { name: "Academy", pages: [{ path: "/academy", marker: "h1" }, { path: "/academy", expect: "member", marker: "h1" }] },
  { name: "Flame POS", pages: [{ path: "/pos", marker: "h1" }, { path: "/pos", expect: "member", marker: "h1" }] },
  { name: "15 business calculators", pages: [{ path: "/business-calculators", marker: "h1" }, ...CALCULATORS.map((id) => ({ path: `/calculators/${id}`, expect: "login" })), ...CALCULATORS.map((id) => ({ path: `/calculators/${id}`, expect: "member", marker: "h1" })), { path: "/workspace/calculators", expect: "member", marker: "h1" }] },
  { name: "Mini-sites (business pages)", pages: [{ path: "/directory", marker: "h1", firstDetail: "a[href^='/directory/'], a[href*='/business/']" }] },
  { name: "Directory", pages: [{ path: "/directory", marker: "h1" }, { path: "/members", marker: "h1" }] },
  { name: "RideSafe", pages: [{ path: "/ridesafe", marker: "h1" }, { path: "/ridesafe/providers/apply", marker: "form, h1" }] },
  { name: "Ka-FLAME AI", pages: [{ path: "/bizconsult-ai", marker: "h1" }, { path: "/bizconsult-ai", expect: "member", marker: "h1, textarea" }] },
  { name: "Fulfillment by MSMEs", pages: [{ path: "/fulfillment", marker: "h1" }, { path: "/fulfillment", expect: "member", marker: "h1" }] },
  { name: "Opportunities", pages: [{ path: "/opportunities", marker: "h1" }, { path: "/deals", marker: "h1" }] },
  { name: "Forum", pages: [{ path: "/forum", marker: "h1" }] },
  { name: "Blog (Negosyo News)", pages: [{ path: "/news", marker: "h1" }, { path: "/negosyo-talks", marker: "h1" }] },
  { name: "Events", pages: [{ path: "/workshops", marker: "h1" }, { path: "/trainings-webinars", marker: "h1" }, { path: "/expos-summits", marker: "h1" }] },
  { name: "Chapters", pages: [{ path: "/chapters", marker: "h1" }, { path: "/chapters/ncr", marker: "h1" }, { path: "/chapters/calabarzon", marker: "h1" }, { path: "/chapters/central-luzon", marker: "h1" }, { path: "/about/chapters", marker: "h1" }] },
  { name: "Volunteer services", pages: [{ path: "/volunteering", marker: "h1" }, { path: "/get-involved", marker: "h1" }, { path: "/get-involved/professional-services", marker: "h1" }, { path: "/volunteering", expect: "member", marker: "h1" }] },
  { name: "Member ID", pages: [{ path: "/account", expect: "login" }, { path: "/account", expect: "member", marker: "#member-id, [data-member-card], h1" }] },
  { name: "Join and sign in", pages: [{ path: "/join", marker: "form" }, { path: "/login", marker: "form" }] },
  { name: "Member feed and shell", pages: [{ path: "/home", expect: "login" }, { path: "/home", expect: "member", marker: "[data-shell='top-bar']" }, { path: "/messages", expect: "member", marker: "h1" }, { path: "/more", expect: "member", marker: "h1" }] },
  { name: "Group Order", pages: [{ path: "/group-order", expect: "member", marker: "h1" }] },
  { name: "Privacy (data rights)", pages: [{ path: "/legal/privacy", marker: "h1" }, { path: "/account/privacy", expect: "login" }, { path: "/account/privacy", expect: "member", marker: "h1" }] },
];

/** Smaller set used on the slower browser/device pairs; every page above runs on Android Chrome and desktop Chrome. */
export const CORE = ["/?view=public", "/academy", "/pos", "/business-calculators", "/directory", "/ridesafe", "/bizconsult-ai",
  "/fulfillment", "/opportunities", "/forum", "/news", "/workshops", "/chapters/ncr", "/volunteering", "/join", "/login", "/legal/privacy"];
