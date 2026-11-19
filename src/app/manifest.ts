import type { MetadataRoute } from "next";

/** Installable app (Phase 11): "Add to Home screen" on Android and iPhone, opens full screen like an app. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "FLAME PH",
    short_name: "FLAME PH",
    description: "Founders and Leaders Advancing MSME Ecosystem in the Philippines",
    start_url: "/",
    scope: "/",
    display: "standalone",
    lang: "en-PH",
    categories: ["business", "social"],
    background_color: "#ffffff",
    theme_color: "#003289",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      { name: "Home feed", url: "/home", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
      { name: "New post", url: "/new-post", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
      { name: "Messages", url: "/messages", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
    ],
  };
}
