import type { NextConfig } from "next";

const supabaseHost = process.env.NEXT_PUBLIC_SUPABASE_URL ? new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname : undefined;

const SW_PATHS = ["/sw.js", "/service-worker.js", "/serviceworker.js", "/serviceWorker.js", "/sw-v2.js", "/firebase-messaging-sw.js", "/OneSignalSDKWorker.js"];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  // Put metadata in <head> for every client (not streamed), so all crawlers and audits see descriptions.
  htmlLimitedBots: /.*/,
  images: {
    formats: ["image/avif", "image/webp"],
    deviceSizes: [360, 640, 1024, 1600],
    remotePatterns: supabaseHost ? [{ protocol: "https", hostname: supabaseHost }] : [],
  },
  experimental: {
    serverActions: { bodySizeLimit: "10mb" }, // admin uploads of photos and proof documents
  },
  // Business pages live in the separate FlamePH Pages app; visitors keep seeing www.flameph.org/business/{name}.
  async rewrites() {
    return {
      beforeFiles: [
        { source: "/business", destination: "https://flameph-pages.vercel.app/business" },
        { source: "/business/:path*", destination: "https://flameph-pages.vercel.app/business/:path*" },
      ],
      afterFiles: [],
      fallback: [],
    };
  },
  async redirects() {
    return [
      { source: "/learn", destination: "/resources", permanent: true },
      { source: "/events", destination: "/workshops", permanent: true },
      { source: "/community", destination: "/chapters", permanent: true },
      { source: "/flameph-merchs", destination: "/merch", permanent: true },
      { source: "/about/merch-shop", destination: "/merch", permanent: true },
      { source: "/membership", destination: "/join", permanent: true },
      { source: "/legal", destination: "/legal/terms", permanent: true },
    ];
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(self)" },
        ],
      },
      // The old flameph.org saved itself in visitors' browsers (a service worker). Browsers re-fetch the worker file
      // from here on their next visit; these headers make them wipe the old saved copy and unregister it.
      ...SW_PATHS.map((source) => ({
        source,
        headers: [
          { key: "Clear-Site-Data", value: '"cache", "storage"' },
          { key: "Cache-Control", value: "no-store, max-age=0" },
        ],
      })),
    ];
  },
};

export default nextConfig;
