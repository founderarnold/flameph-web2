# FLAME PH website rebuild: build report

Build date: October 12, 2026 · Stack: Next.js 15 (App Router, TypeScript), Tailwind CSS 4, Supabase, Claude API, Vercel.

## 1. Pages built and their status labels

Every header and footer menu item opens a finished page (checked: all routes return 200; no `#` links). Labels follow the brief: **Live**, **Beta**, **Coming soon**. Pages marked "Coming soon until…" switch to Live automatically once an admin publishes the first item.

| Route | Page | Status |
|---|---|---|
| `/` | Home | — |
| `/programs-ecosystem` | Programs & MSME Ecosystem | Live |
| `/academy` | FLAME PH Academy | Coming soon until a course is published |
| `/negosyo-talks` | FLAME PH NegosyoTalks | Coming soon until an episode is published |
| `/workshops` | Educational Workshops | Live |
| `/trainings-webinars` | Trainings & Webinars | Live |
| `/expos-summits` | Expos & Summits | Live |
| `/awards` | Annual Awards for MSMEs | Coming soon until an admin opens a cycle |
| `/membership/free-benefits` | Avail Free MSME Benefits | Live |
| `/membership/more-benefits` | Get More MSME Benefits | Coming soon (prices hidden until set) |
| `/resources`, `/resources/[slug]` | Resources | Live (empty state until uploads) |
| `/advocacy` | Advocacy | Live |
| `/chapters` | Chapters Near You | Live |
| `/volunteering` | Volunteering | Live |
| `/pos` | Free POS for MSMEs | Coming soon |
| `/directory`, `/directory/[slug]` | Free Business Directory + business mini website | Live |
| `/bizconsult-ai` | Ka-FLAME AI (Q&A chat + listing writer) | Beta |
| `/merch` | FLAME PH Merchs | Coming soon until products are added |
| `/signature-brands` | Flame Signature Brands | Coming soon |
| `/personalized` | Personalized by FLAMEPH | Coming soon |
| `/fulfillment` | Fulfillment by MSMEs | Coming soon |
| MarketplacePH, NegosyoDepot | External links (NegosyoDepot labeled Coming soon) | — |
| `/get-involved` | Get Involved hub (11 cards) | Live |
| `/get-involved/mentor` | Volunteer as Mentor | Live |
| `/get-involved/partner` | Join as Partner | Live |
| `/get-involved/sponsor-event` | Sponsor an Event | Live |
| `/get-involved/sponsor-community` | Sponsor a Community | Live |
| `/get-involved/nominate` | Nominate an MSME Awardee | Coming soon |
| `/get-involved/poverty-alleviation` | Support Poverty Alleviation Program | Live (no donation details until verified) |
| `/news`, `/news/[slug]` | News & Updates | Live |
| `/get-involved/affiliate` | Become an Affiliate Marketer | Coming soon |
| `/get-involved/chapter-leader` | Become a Chapter Leader | Live |
| `/get-involved/resource-speaker` | Volunteer as a Resource Speaker | Live |
| `/get-involved/professional-services` | Volunteer Professional Services | Live |
| `/about` | What is FLAME PH (history, vision, mission, pillars, SEC card, transparency) | Live |
| `/about/founders` | Meet the Founders | Live |
| `/about/team` | Meet the Teams | Live |
| `/about/chapters` | Featured Chapters | Live |
| `/about/mentors` | Featured Mentors | Live |
| `/about/partners` | Featured Partners | Live |
| `/impact` | Live statistics, weekly growth chart, provinces, consented stories | Live |
| `/join`, `/login` | Google or email code sign-in, privacy consent | Live |
| `/account` (+ `/profile`, `/business`, `/ai`) | Member dashboard, digital ID with QR, listing editor, AI history | Live |
| `/verify/[memberId]` | Public member ID verification | Live |
| `/contact` | Contact | Live |
| `/legal/terms`, `/legal/privacy`, `/membership/terms` | Legal (shown as "Draft — for review by counsel" until a founder approves in Admin → Settings) | Live |
| `/admin` | Admin console | Admin only |
| 404, `/offline` | Error and offline pages | — |

Old URLs redirect permanently (308): `/learn`, `/events`, `/community`, `/flameph-merchs`, `/about/merch-shop`, `/membership`, `/legal`.

## 2. How the truth rules are enforced

- **Live statistics only.** All numbers come from the Postgres function `public_stats()` (cached 5 minutes). On error the site shows "—" and "temporarily unavailable", never a fallback number. Below 50 members (configurable) the home page says "Be one of our founding members." The AI helpful rate appears only after 20 ratings.
- **Empty tables on day one.** The seed inserts only the section 3 facts: the four founders, the tier names (no prices), and settings including the menu. No sample people, businesses, chapters, mentors, events or testimonials.
- **Database constraints**: a partner cannot be published without a proof file; a story without a consent file; a mentor or team member without consent. Proof and consent files live in a private bucket and are never exposed publicly.
- Members cannot give themselves a higher tier or a Verified badge (database triggers). Verified is set only by admins after checking documents.
- Home-page stories of Ana, Ben, Carla and Dina are labeled "Example scenario".
- Ka-FLAME AI never invents fees or laws, ends tax/legal/permit/financing answers with "Paki-verify sa…" plus the official link, declines investment advice, and treats user text as data (prompt-injection attempts get a polite refusal).
- No payments are collected anywhere on the site.

## 3. Images

| Image | Use |
|---|---|
| `LOGO New FLAMEPH 9Sept26 3.png` (wordmark) | Header, footer, member ID card, social preview image. Trimmed and resized; not redrawn. |
| `LOGO New FLAMEPH NavIcon 27Sept26.png` (round icon) | Favicon, Apple touch icon, PWA icons (192, 512, maskable), home hero. |
| Generated `flameph-social-preview.png` | Open Graph image: wordmark, tagline, SEC number. |

**Not available for this build:** the old site's `assets/images/` folder (flame-principle, shared-costs, business-flow, learning guides, ID card, sample ID) and the Google Stitch images. They were not in the project, so the FLAME Principle section uses a simple drawn diagram labeled "Illustration only". Once the old folder is shared, the images can be dropped into `/public/images/legacy/` and reused under truth rule 6.

**Project photos not published yet:** the project folder has photos that appear to be real events: `Palayan CIty WORKSHOP*.jpg`, `Pasay DepEd ALS Workshop COLLAB*.jpg` and eight `Untitled design*.png` collages. Under the brief they are held back until a founder confirms the date, venue and attendance for each. Then an admin adds each as a completed event in Admin → Events with the photos marked as real photos, and they count toward "Events held" and "Event attendees".

**Images containing claims or branding in the artwork:** several collages show Manager's Pizza banners and promotional text ("BUY 1 FREE 1", promo prices) and other organizations' logos and banners (schools division, a bank booth). If these are published as event photos, they should be captioned as photos of that event only. They must not be presented as FLAME PH partnerships unless a signed agreement exists. No illustration with an invented statistic is used anywhere on the site.

## 4. Lighthouse (mobile, local production build, before Vercel)

| Page | Performance | Accessibility | Best Practices | SEO |
|---|---|---|---|---|
| Home | 96 | 100 | 96 | 92 |
| Directory | 98 | 100 | 96 | 92 |
| Ka-FLAME AI | 99 | 100 | 96 | 92 |
| Volunteer as Mentor (form page) | 98 | 100 | 96 | 92 |

Largest Contentful Paint was 2.0 to 2.4 seconds, and pages were about 200 KB on first load. The Best Practices deduction is the Vercel Analytics script, which only loads on Vercel. The SEO deduction (meta description streamed after the head) is fixed in this commit. Re-run Lighthouse on the Vercel preview once it is deployed.

Also checked: no horizontal scrolling at 360 px or 1280 px; tap targets are at least 44 px; keyboard-accessible dropdowns; a skip link; and no API keys in client bundles (the Claude key and the Supabase service key are only read in server code).

## 5. Open questions for the founders (section 16; not answered by the build)

1. Has the SEC registration been amended to the FLAME PH name, or is FAME PH still the registered name? The About page and footer currently say "FLAME PH (formerly FAME PH …)" and show FAME PH as the registered name.
2. Which official social media accounts (Facebook page, TikTok, YouTube) should be linked? Add them in Admin → Settings; they stay hidden until then.
3. Founder photos and profile links (Admin → Founders). Until then each founder shows initials in a circle.
4. Membership tier prices, and which paid benefits will really be delivered (Admin → Membership tiers).
5. Official bank or GCash details for donations, if any, and the receipts process (Admin → Settings).
6. Dates and real attendance of past workshops, with real photos and sign-in sheets (see the photos in section 3).
7. Any signed partnership agreements to publish (Admin → Partners, with the proof file).

### Additional items from this build
- **Copy written fresh.** The old site's copy for the "Ano ang kailangan mo ngayon?" need-picker and the Ana, Ben, Carla and Dina scenarios wasn't available, so new copy was written. Please review it.
- **Filipino toggle.** Menus, buttons, footer and key headlines switch between English and Filipino. Long page bodies are Taglish-friendly English and still need a full Filipino translation.
- **Ka-FLAME AI spend cap.** It starts at 0, which means no cap. Set a monthly cap in Admin → Settings before launch. The default model is Claude Haiku 5.5, and you can change it with the `ANTHROPIC_MODEL` setting.
- **Email notifications** need a Resend account and API key, with flameph.org verified as a sending domain. Without it, submissions are still saved and appear in Admin → Form inbox.
- **Legal documents** are plain-language drafts and need review by counsel before a founder marks them approved.
- **Launch date.** Set it in Admin → Settings on launch day so the Impact page can say when the platform launched.
