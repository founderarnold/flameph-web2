import { cookies } from "next/headers";
import en from "@/messages/en.json";
import fil from "@/messages/fil.json";

export type Lang = "en" | "fil";
export type Dict = typeof en;
const dicts: Record<Lang, Dict> = { en, fil };

export async function getLang(): Promise<Lang> {
  const c = await cookies();
  return c.get("lang")?.value === "fil" ? "fil" : "en";
}

export async function getDict(): Promise<Dict> {
  return dicts[await getLang()];
}

/** Pick English or Filipino copy for page-level strings. */
export function pick<T>(lang: Lang, en: T, fil?: T): T {
  return lang === "fil" && fil !== undefined ? fil : en;
}
