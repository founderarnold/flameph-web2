# flameph.org

## FLAME PH RideSafe (`/ridesafe`)

The RideSafe route is served at `https://www.flameph.org/ridesafe` after deployment. It currently provides:

- Interactive Google Maps embedded inside RideSafe, including in-app map searches and route results.
- Browser geolocation only after a visitor taps the location control; the selected point stays in page memory and is not sent to FLAME PH.
- Destination entry, service-category search and emergency roadside search update the embedded Google Map instead of opening a new tab. Google supplies its own routes, traffic and listings; RideSafe does not verify third-party results.
- Car, motorcycle, EV, hybrid and truck filters, and an emergency flow with a direct `tel:911` action, coordinates, and explicit location sharing.
- FLAME PH account links. The FLAME PH sign-in is reused on this origin; identity federation across NegosyoDepot, MarketplacePH and ManagersPizza is not configured by this RideSafe change.

The map is embedded through Google Maps. Its signed-in account depends on the Google session and cookie settings in the visitor's browser; FLAME PH authentication does not provide Google credentials to the embedded map. The FLAME PH response policy permits geolocation on this same origin.

Verified service listings, in-app directions/traffic, dispatch, saved vehicle/trip data and cross-site SSO still require provider agreements, trusted data, identity setup and backend work. Do not represent these as live.

The website and member platform of **FLAME PH — Federation of Leaders Advancing MSME Ecosystem in the Philippines** (SEC Reg. No. 2024050150009-15).

Next.js (App Router, TypeScript) · Tailwind CSS · Supabase (Postgres, Auth, Storage, Row Level Security) · Anthropic Claude API (Ka-FLAME AI) · Vercel.

Every statistic on the site is counted live from the database. On launch day the numbers start at zero.

## Set up in four steps

### 1. Supabase
1. Create a project at [supabase.com](https://supabase.com) (region: Singapore is closest to the Philippines).
2. Open **SQL Editor**, paste the whole of [`supabase/setup.sql`](supabase/setup.sql) and click **Run**. This creates every table, the Row Level Security policies, the live-stats functions, the storage buckets, and seeds only the verified facts (founders, tiers, settings, menu).
3. **Authentication → Providers**: enable **Email** (keep "Confirm email" on). Enable **Google** and paste a Google OAuth client ID/secret (create one in Google Cloud Console; authorized redirect URI = the callback URL Supabase shows).
4. **Authentication → URL Configuration**: Site URL `https://flameph.org`; add redirect URLs `https://flameph.org/auth/callback`, `https://*.vercel.app/auth/callback` and `http://localhost:3000/auth/callback`.
5. **Authentication → Email Templates → Magic Link**: include `{{ .Token }}` so members can type the 6-digit code as well as tap the link.
6. For reliable email delivery, set **Authentication → SMTP Settings** to your email provider (e.g. Resend).

### 2. Vercel
1. Import this GitHub repo in [vercel.com/new](https://vercel.com/new). Framework: Next.js (auto-detected).
2. Add the environment variables from [`.env.example`](.env.example) for **Production** and **Preview**. The required ones are `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `ANTHROPIC_API_KEY` and `NEXT_PUBLIC_SITE_URL`. Transactional email uses `RESEND_API_KEY`, `EMAIL_FROM`, `NOTIFY_EMAIL`, and the dedicated `REAL_ESTATE_ADMIN_EMAIL` recipient.
3. Deploy. Every pull request gets its own preview URL; `main` deploys to production.
4. Add the domain `flameph.org` under **Settings → Domains**.
5. Optional: enable **Analytics** (privacy-friendly, no cookies). The site already includes the Vercel Analytics script.

### 3. Make yourself the first admin
Sign up on the site with your email, then run this once in the Supabase SQL Editor:

```sql
insert into public.roles (user_id, role)
select id, 'super_admin' from auth.users where email = 'flameph.org@gmail.com';
```

Then open `/admin`. Super admins can give other members the `admin`, `editor` or `chapter_leader` role from **Admin → Members**.

### 4. Fill in what only the founders know
In **Admin → Settings**: official social links, launch date, Ka-FLAME AI limits and monthly spend cap, verified donation details, and approval of the legal documents. In **Admin → Founders**: photos and profile links. See `BUILD_REPORT.md` for the open questions.

## Local development

```bash
cp .env.example .env.local   # fill in the values
npm install
npm run dev                  # http://localhost:3000
```

The site runs without any keys: pages render with empty states and stats show "—". Forms, sign-up and Ka-FLAME AI need the Supabase and Anthropic keys.

Other scripts: `npm run build`, `npm run lint`, `npm run typecheck`, `npm run db:seed-sql` (regenerates `supabase/seed.sql` and `supabase/setup.sql` from `src/lib/site.ts` and the menu).

## Where things live

| Path | What |
|---|---|
| `src/lib/site.ts` | Verified organization facts, taglines, founders. Edit carefully: these are the only facts seeded. |
| `src/content/nav.json` | Header and footer menu (also seeded to `settings.menu`). |
| `src/lib/forms.ts` | Every public form. Submissions go to the `submissions` table and email flameph.org@gmail.com. |
| `src/content/involved.ts` | Copy for the Get Involved pages. |
| `src/messages/{en,fil}.json` | Interface text in English and Filipino. |
| `src/lib/ai/` | Ka-FLAME AI system prompt, limits, retrieval and logging. |
| `src/lib/admin/config.ts` | Admin console tables and fields. Add a field here to edit it in `/admin`. |
| `supabase/migrations/` | Database schema. |

## Truth rules (keep these)
- No typed-in numbers. Statistics come from `public.public_stats()`.
- No sample people, businesses, testimonials or partners. Lists show designed empty states.
- Partners cannot be published without a proof file; stories without a consent file; mentors and team members without consent (enforced by database constraints).
- Every feature carries a Live, Beta or Coming soon label.
- No payments are collected on the site.
