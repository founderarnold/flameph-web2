import type { Metadata, Viewport } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";
import { Analytics } from "@vercel/analytics/next";
import "./globals.css";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { BottomBar } from "@/components/BottomBar";
import { RegisterSW } from "@/components/RegisterSW";
import { KaFlameFab } from "@/components/KaFlameFab";
import { cookies } from "next/headers";
import { getDict, getLang } from "@/lib/i18n";
import { FOUNDERS, ORG, PURPOSE, TAGLINES } from "@/lib/site";

const font = Plus_Jakarta_Sans({ subsets: ["latin"], weight: ["400", "600", "700", "800"], variable: "--font-body", display: "swap" });

export const metadata: Metadata = {
  metadataBase: new URL(ORG.url),
  title: { default: "FLAME PH — Build Ecosystem. Fuel Leaders. Empower Entrepreneurs.", template: "%s · FLAME PH" },
  description: PURPOSE,
  applicationName: "FLAME PH",
  manifest: "/manifest.webmanifest",
  openGraph: { type: "website", siteName: "FLAME PH", locale: "en_PH" },
  twitter: { card: "summary_large_image" },
  appleWebApp: { capable: true, title: "FLAME PH", statusBarStyle: "default" },
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
  alternateName: ["Federation of Leaders Advancing MSME Ecosystem in the Philippines", "FAME PH"],
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
  return (
    <html lang={lang === "fil" ? "fil" : "en-PH"} className={font.variable} style={{ ["--font-heading" as string]: "var(--font-body)" }}>
      <body className="min-h-screen font-sans antialiased">
        <Header />
        <main id="main">{children}</main>
        <Footer />
        <BottomBar labels={{ home: t.home, kaflame: t.kaflame, directory: t.directory, account: t.account }} />
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
        {signedIn && <KaFlameFab />}
        <RegisterSW />
        <Analytics />
      </body>
    </html>
  );
}
