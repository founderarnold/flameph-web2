import type { Metadata, Viewport } from "next";
import { Analytics } from "@vercel/analytics/next";
import { SiteMonitor } from "@/components/SiteMonitor";
import "./globals.css";
import "./ridesafe/ridesafe.css";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { PageShareBar } from "@/components/PageShareBar";
import { RegisterSW } from "@/components/RegisterSW";
import { EmailLinkSignIn } from "@/components/EmailLinkSignIn";
import { KaFlameFab } from "@/components/KaFlameFab";
import { MemberBottomBar } from "@/components/shell/MemberTabsNav";
import { inboxCount, latestFeedAt, shellSession, unreadMessages } from "@/lib/member-shell-data";
import { cookies } from "next/headers";
import { getDict, getLang } from "@/lib/i18n";
import { FOUNDERS, ORG, PURPOSE, TAGLINES } from "@/lib/site";
import { NAV } from "@/lib/nav";

export const metadata: Metadata = {
  metadataBase: new URL(ORG.url),
  title: { default: "FLAME PH — Build Ecosystem. Fuel Leaders. Empower Entrepreneurs.", template: "%s · FLAME PH" },
  description: PURPOSE,
  applicationName: "FLAME PH",
  manifest: "/manifest.webmanifest",
  openGraph: { type: "website", siteName: "FLAME PH", locale: "en_PH" },
  twitter: { card: "summary_large_image" },
  appleWebApp: { capable: true, title: "FLAME PH", statusBarStyle: "default" },
  other: { "facebook-domain-verification": "frcnnn2y9v97rkwnrp0hol4i143mk6" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: [{ media: "(prefers-color-scheme: light)", color: "#ffffff" }, { media: "(prefers-color-scheme: dark)", color: "#0e121a" }],
};

const jsonLd = {
  "@context": "https://schema.org",
  "@type": "NGO",
  name: "FLAME PH",
  legalName: ORG.legalName,
  alternateName: ["Founders and Leaders Advancing MSME Ecosystem in the Philippines", "FAME PH"],
  url: ORG.url,
  logo: `${ORG.url}/brand/flameph-logo.png`,
  slogan: TAGLINES.main,
  description: PURPOSE,
  foundingDate: ORG.secRegisteredIso,
  identifier: { "@type": "PropertyValue", propertyID: "SEC Registration No.", value: ORG.secNo },
  nonprofitStatus: "Nonprofit",
  email: ORG.emailPrimary,
  address: { "@type": "PostalAddress", streetAddress: "Greenville Subd., Barangay San Jose", addressLocality: "San Fernando City", addressRegion: "Pampanga", addressCountry: "PH" },
  founder: FOUNDERS.map((f) => ({ "@type": "Person", name: f.name, jobTitle: f.title })),
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const [lang, t, c] = await Promise.all([getLang(), getDict(), cookies()]);
  const signedIn = c.getAll().some((x) => x.name.startsWith("sb-") && x.name.includes("auth-token"));
  // One header and one five-tab phone bar for everyone (owner, 22 Nov 2026). Members get their Home button, Messages,
  // Inbox and Account in the header; visitors' tabs open public pages or sign-up, and their More tab opens the site menu.
  const member = signedIn ? Boolean((await shellSession()).user) : false;
  const [unread, inbox, latest] = member ? await Promise.all([unreadMessages(), inboxCount(), latestFeedAt()]) : [0, 0, null];
  return (
    <html
      lang={lang === "fil" ? "fil" : "en-PH"}
      style={{
        ["--font-body" as string]: '"Trebuchet MS", "Segoe UI", Arial, sans-serif',
        ["--font-heading" as string]: '"Trebuchet MS", "Segoe UI", Arial, sans-serif',
      }}
    >
      <body className="min-h-screen font-sans antialiased">
        <Header member={member ? { unread, inbox, latest } : undefined} />
        <main id="main">{children}</main>
        <PageShareBar />
        <Footer />
        {member ? <MemberBottomBar /> : <MemberBottomBar visitor={{ groups: NAV, lang, labels: { menu: t.menu, close: t.close, login: t.login, account: t.account, joinFree: t.joinFree } }} />}
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
        {signedIn && <KaFlameFab />}
        <RegisterSW />
        <EmailLinkSignIn />
        <Analytics />
        <SiteMonitor />
      </body>
    </html>
  );
}
