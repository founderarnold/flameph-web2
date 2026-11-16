// Member app screens (Home feed, the five tabs, Workspace). Each page checks sign-in itself so it can return the member to the right place.
export const metadata = { robots: { index: false } };

export default function MemberLayout({ children }: { children: React.ReactNode }) {
  return <div className="container-x pb-10 pt-4 sm:pt-6">{children}</div>;
}
