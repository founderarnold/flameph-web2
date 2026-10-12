import type { Metadata } from "next";

export function meta(title: string, description: string, path: string): Metadata {
  return {
    title,
    description,
    alternates: { canonical: path },
    openGraph: { title: `${title} · FLAME PH`, description, url: path, images: ["/brand/flameph-social-preview.png"] },
  };
}
