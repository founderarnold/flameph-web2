import type { Tab } from "@/lib/member-shell";

const PATHS: Record<Tab["key"], React.ReactNode> = {
  "group-order": <path d="M7 11a3 3 0 100-6 3 3 0 000 6zM17 11a3 3 0 100-6 3 3 0 000 6zM2 20a5 5 0 0110 0M12 20a5 5 0 0110 0" />,
  fulfillment: <path d="M3 7l9-4 9 4v10l-9 4-9-4zM3 7l9 4 9-4M12 11v10" />,
  "new-post": <path d="M12 5v14M5 12h14M4 4h16v16H4z" />,
  pos: <path d="M5 3h14v18H5zM8 7h8M8 11h2M12 11h2M8 15h2M12 15h2M16 11v6" />,
  more: <path d="M4 6h16M4 12h16M4 18h16" />,
};

export function TabIcon({ k }: { k: Tab["key"] }) {
  return <svg aria-hidden width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">{PATHS[k]}</svg>;
}
