// Production builds of www.flameph.org may only come from GitHub `main`.
// On 30 Oct 2026 an older local copy was published straight to production and removed a week of saved work.
// This check runs before every build (npm "prebuild"). It does nothing for local builds and preview deployments.
//
// Emergency override (owner only): set ALLOW_NON_MAIN_PRODUCTION_BUILD=1 in Vercel for one deployment, then remove it.

const REPO_OWNER = "founderarnold";
const REPO_SLUG = "flameph-web2";
const BRANCH = "main";

const env = process.env;
if (env.VERCEL_ENV !== "production") process.exit(0);

if (env.ALLOW_NON_MAIN_PRODUCTION_BUILD === "1") {
  console.warn("[deploy guard] Override set: allowing a production build that may not come from GitHub main.");
  process.exit(0);
}

const fail = (why) => {
  console.error(`\n[deploy guard] Production build refused: ${why}`);
  console.error(`[deploy guard] Publish www.flameph.org only by merging a pull request into ${REPO_OWNER}/${REPO_SLUG}@${BRANCH}.`);
  console.error("[deploy guard] Do not run `vercel --prod` from a local folder.\n");
  process.exit(1);
};

if (env.VERCEL_GIT_PROVIDER !== "github") fail("this deployment was not created from GitHub (for example, a CLI upload from a local folder).");
if (env.VERCEL_GIT_REPO_OWNER !== REPO_OWNER || env.VERCEL_GIT_REPO_SLUG !== REPO_SLUG) fail(`it comes from ${env.VERCEL_GIT_REPO_OWNER}/${env.VERCEL_GIT_REPO_SLUG}, not ${REPO_OWNER}/${REPO_SLUG}.`);
if (env.VERCEL_GIT_COMMIT_REF !== BRANCH) fail(`it comes from branch "${env.VERCEL_GIT_COMMIT_REF}", not "${BRANCH}".`);

// Best effort: the commit must be on main's history (its tip, or an older main commit), never a commit main does not contain.
// If GitHub cannot be reached (rate limit, outage), the branch checks above still apply and the build continues.
const sha = env.VERCEL_GIT_COMMIT_SHA;
try {
  const res = await fetch(`https://api.github.com/repos/${REPO_OWNER}/${REPO_SLUG}/compare/${BRANCH}...${sha}`, {
    headers: { accept: "application/vnd.github+json", "user-agent": "flameph-deploy-guard" },
    signal: AbortSignal.timeout(8000),
  });
  if (res.ok) {
    const cmp = await res.json();
    // compare main...sha: "identical" = this commit is main's tip; "behind" = it is an older commit of main (a newer deployment follows).
    // Anything else means the commit is not on main's history.
    if (!["identical", "behind"].includes(cmp.status)) fail(`commit ${sha?.slice(0, 7)} is not part of ${BRANCH}'s history.`);
    if (cmp.status === "behind") console.warn(`[deploy guard] Commit ${sha?.slice(0, 7)} is ${cmp.behind_by} commit(s) behind ${BRANCH}; a newer deployment will follow.`);
  } else {
    console.warn(`[deploy guard] GitHub check skipped (HTTP ${res.status}); branch checks passed.`);
  }
} catch (e) {
  console.warn(`[deploy guard] GitHub check skipped (${e?.name ?? "error"}); branch checks passed.`);
}
console.log(`[deploy guard] OK: production build from ${REPO_OWNER}/${REPO_SLUG}@${BRANCH} (${sha?.slice(0, 7)}).`);
