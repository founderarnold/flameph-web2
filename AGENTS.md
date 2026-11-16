# Rules for anyone (person or AI agent) working on www.flameph.org

## Publishing: GitHub `main` is the only way to production

1. **Never publish from a local folder.** Do not run `vercel --prod`, `vercel deploy --prod`, or upload a build by any other route.
2. **Every change goes through a pull request** into `founderarnold/flameph-web2`, branched from the latest `main`. Vercel deploys production automatically when the pull request is merged.
3. **Start from the latest `main`**, every time: `git fetch origin main` first. Never continue from an older copy, a zip, or another tool's private folder.
4. **One change at a time.** If another person or agent has an open pull request touching the same files, coordinate before merging.
5. **The owner merges.** Agents open pull requests and wait for the owner's approval.

Why: on 30 Oct 2026 an older local copy was published straight to production. It removed a week of saved work, including FLAME POS sign-in and www.flameph.org/business links.

`scripts/guard-production-deploy.mjs` runs before every build and refuses a production build that does not come from GitHub `main`. Only the owner may set `ALLOW_NON_MAIN_PRODUCTION_BUILD=1` in Vercel for an emergency, and must remove it right after.

## Other standing rules

- Reuse first, extend second, create new only if missing. Search the code and database before adding anything.
- Keep every existing page, URL, route and redirect working. No deletion or renaming without the owner's approval.
- Database changes are additive numbered migrations in `supabase/migrations`, with row level security on every new table. Take a backup before applying one to production.
- Never commit secrets. Never change DNS, nameservers or secrets without the owner's explicit instruction.
