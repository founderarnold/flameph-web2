import type { TabKey } from "@/lib/member-shell";

const PATHS: Record<TabKey, React.ReactNode> = {
  home: <path d="M3 11l9-7 9 7M5 9.5V20h14V9.5M10 20v-5h4v5" />,
  workspace: <path d="M3 7h18v13H3zM8 7V4h8v3M3 13h18" />,
  create: <path d="M12 6v12M6 12h12M12 21a9 9 0 100-18 9 9 0 000 18z" />,
  inbox: <><path d="M4 13l2.5-8h11L20 13v6H4z" /><path d="M4 13h5l1 2h4l1-2h5" /></>,
  menu: <path d="M4 6h16M4 12h16M4 18h16" />,
  explore: <path d="M12 21a9 9 0 100-18 9 9 0 000 18zM15.5 8.5l-2 5-5 2 2-5z" />,
  join: <path d="M10 11a4 4 0 100-8 4 4 0 000 8zM3 21a7 7 0 0114 0M19 8v6M16 11h6" />,
  tools: <path d="M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z" />,
};

export function TabIcon({ k }: { k: TabKey }) {
  return <svg aria-hidden width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">{PATHS[k]}</svg>;
}
