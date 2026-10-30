"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { ShareButtons } from "./ShareButtons";

type SharePage = {
  pathname: string;
  path: string;
  title: string;
};

export function PageShareBar() {
  const pathname = usePathname();
  const [page, setPage] = useState<SharePage | null>(null);

  useEffect(() => {
    const marker = document.querySelector<HTMLElement>('section[data-page-share="true"]');
    const path = marker?.dataset.sharePath;
    const title = marker?.dataset.shareTitle;
    setPage(marker && path && title ? { pathname, path, title } : null);
  }, [pathname]);

  if (!page || page.pathname !== pathname) return null;

  return (
    <aside className="pre-footer-share mt-12 border-t border-line bg-bg-warm/60" aria-label="Share this page">
      <div className="container-x py-7">
        <ShareButtons path={page.path} title={page.title} />
      </div>
    </aside>
  );
}
