import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "FLAME PH",
    short_name: "FLAME PH",
    description: "Federation of Leaders Advancing MSME Ecosystem in the Philippines",
    start_url: "/",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#003289",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
