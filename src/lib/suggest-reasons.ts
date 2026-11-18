// Why a member is suggested to follow, in plain words. Pure, shared by the suggestions and the tests.

/** Plain words for why someone is suggested. */
export function reasonLabel(r: { reason: string; detail: string | null }): string | null {
  switch (r.reason) {
    case "city": return r.detail ? `Near you in ${r.detail}` : "Near you";
    case "chapter": return "In your chapter";
    case "mutual": { const n = Number(r.detail) || 1; return `${n} mutual connection${n === 1 ? "" : "s"}`; }
    case "industry": return r.detail ? `Also in ${r.detail}` : "Same industry";
    case "province": return r.detail ? `Also in ${r.detail}` : "Same province";
    case "group": return "In your groups";
    case "new": return "New member";
    default: return null;
  }
}
