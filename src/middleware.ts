import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { FEED, MEMBER_REWRITES } from "@/lib/member-shell";

/** Where a signed-in member lands instead of the public home page: the Home feed. */
const MEMBER_HOME = FEED;

export async function middleware(request: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  let response = NextResponse.next({ request });
  if (!url || !key) return response;

  // The fork. Visitors (no sign-in cookie) see the public home page exactly as before, with no extra work.
  // "/?view=public" lets members open the public home page too.
  const path = request.nextUrl.pathname;
  const isHome = path === "/";
  const memberTab = MEMBER_REWRITES[path];
  // "?view=public" also opens the public page of a tab (/fulfillment, /pos, /bizconsult-ai, /academy, /volunteering) for members.
  if (isHome || memberTab) {
    const signedInCookie = request.cookies.getAll().some((c) => c.name.startsWith("sb-") && c.name.includes("-auth-token"));
    if (!signedInCookie || request.nextUrl.searchParams.get("view") === "public") return response;
  }

  const supabase = createServerClient(url, key, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (list) => {
        list.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        list.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });
  // Refreshes the auth token if needed.
  const { data } = await supabase.auth.getUser();
  if (isHome && data.user) {
    const to = NextResponse.redirect(new URL(MEMBER_HOME, request.url));
    response.cookies.getAll().forEach((c) => to.cookies.set(c));
    to.headers.set("cache-control", "private, no-store");
    return to;
  }
  // Signed out on a My account or Admin page: sign in, then come back to that same page (not the My account home).
  if (!data.user && request.method === "GET" && /^\/(account|admin)(\/|$)/.test(path)) {
    const to = new URL("/login", request.url);
    to.searchParams.set("next", path + request.nextUrl.search);
    const res = NextResponse.redirect(to);
    response.cookies.getAll().forEach((c) => res.cookies.set(c));
    return res;
  }
  // Same address, member version: /fulfillment, /pos and /bizconsult-ai show the member version to signed-in members.
  if (memberTab && data.user) {
    const to = NextResponse.rewrite(new URL(memberTab + request.nextUrl.search, request.url), { request });
    response.cookies.getAll().forEach((c) => to.cookies.set(c));
    to.headers.set("cache-control", "private, no-store");
    return to;
  }
  return response;
}

export const config = {
  matcher: ["/", "/home", "/group-order", "/new-post", "/more", "/workspace", "/fulfillment", "/pos", "/m/:path*", "/welcome", "/members/:path*", "/posts/:path*", "/report", "/friends", "/groups", "/groups/:path*", "/forum", "/forum/:path*", "/account/:path*", "/sso/:path*", "/admin/:path*", "/auth/:path*", "/api/:path*", "/bizconsult-ai", "/academy", "/volunteering", "/business-calculators", "/calculators/:path*", "/login", "/join"],
};
