"use client";
import { useRouter } from "next/navigation";
import type { Lang } from "@/lib/i18n";

export function LangToggle({ lang }: { lang: Lang }) {
  const router = useRouter();
  const set = (l: Lang) => {
    document.cookie = `lang=${l}; path=/; max-age=31536000; samesite=lax`;
    router.refresh();
  };
  return (
    <div role="group" aria-label="Language" className="inline-flex rounded-lg border border-line p-0.5 text-sm font-semibold">
      {(["en", "fil"] as const).map((l) => (
        <button key={l} type="button" aria-pressed={lang === l} onClick={() => set(l)}
          className={`min-h-9 min-w-11 rounded-md px-2 ${lang === l ? "bg-primary text-primary-fg" : "hover:bg-bg-soft"}`}>
          {l === "en" ? "EN" : "FIL"}
        </button>
      ))}
    </div>
  );
}
