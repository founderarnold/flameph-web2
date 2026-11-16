import { requireStaff } from "@/lib/auth";
import { Avatar, Button, Chip, CountBadge, EmptyState, Field, Notice, Skeleton, Switch, UnseenDot } from "@/components/ui";
import { StatusBadge } from "@/components/StatusBadge";

export const metadata = { title: "Design system", robots: { index: false } };

const COLOURS = [
  ["bg", "Page background"], ["bg-soft", "Soft section"], ["bg-warm", "Hero band"], ["card", "Card"], ["fg", "Text"], ["fg-muted", "Secondary text"],
  ["border", "Lines"], ["primary", "FLAME PH blue"], ["primary-soft", "Blue tint"], ["mph", "Links"], ["flame", "Flame"], ["flame-strong", "Flame (text-safe)"],
  ["flame-soft", "Flame tint"], ["gold", "Gold"], ["ok", "Success"], ["ok-soft", "Success tint"], ["warn", "Warning"], ["warn-soft", "Warning tint"],
  ["danger", "Error"], ["danger-soft", "Error tint"], ["focus", "Focus ring"],
] as const;

const TYPE = [
  ["text-xs", "12px · labels, badges"], ["text-sm", "14px · captions, help text"], ["text-base", "16px · body (never smaller for inputs)"],
  ["text-lg", "18px · intros, card titles"], ["text-xl", "20px · sub-headings"], ["text-2xl", "24px · section titles"],
  ["text-3xl", "30px · page titles (phone)"], ["text-4xl", "36px · page titles (tablet)"], ["text-5xl", "48px · page titles (desktop)"],
] as const;

const SPACE = [["1", "4px"], ["2", "8px"], ["3", "12px"], ["4", "16px · phone gutter"], ["5", "20px · card padding"], ["6", "24px · tablet gutter"], ["8", "32px"], ["10", "40px · section (phone)"], ["14", "56px · section (desktop)"]] as const;

/** Staff-only living reference for the member-layer design system. Not linked from public pages. */
export default async function DesignSystemPage() {
  await requireStaff();
  return (
    <div className="space-y-10">
      <header>
        <h1 className="text-2xl font-extrabold text-primary">Design system</h1>
        <p className="mt-1 max-w-2xl text-muted">The shared look for the member experience. It reuses the existing flameph.org styles; nothing here changes a public page. Full notes: <code>docs/DESIGN_SYSTEM.md</code>.</p>
      </header>

      <section aria-labelledby="ds-colour">
        <h2 id="ds-colour" className="text-xl font-extrabold">Colour tokens</h2>
        <p className="text-sm text-muted">Each switches automatically for dark mode.</p>
        <ul className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {COLOURS.map(([t, label]) => (
            <li key={t} className="card flex items-center gap-3 p-3">
              <span aria-hidden className="h-10 w-10 shrink-0 rounded-lg border border-line" style={{ background: `var(--${t})` }} />
              <span><span className="block text-sm font-bold">{label}</span><code className="text-xs text-muted">--{t}</code></span>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="ds-type">
        <h2 id="ds-type" className="text-xl font-extrabold">Type scale</h2>
        <ul className="mt-3 space-y-2">{TYPE.map(([c, note]) => <li key={c} className="flex flex-wrap items-baseline gap-x-4"><span className={`${c} font-bold`}>Negosyo</span><code className="text-xs text-muted">{c} · {note}</code></li>)}</ul>
      </section>

      <section aria-labelledby="ds-space">
        <h2 id="ds-space" className="text-xl font-extrabold">Spacing (4px steps)</h2>
        <ul className="mt-3 space-y-1">{SPACE.map(([n, px]) => <li key={n} className="flex items-center gap-3"><span aria-hidden className="h-3 rounded bg-primary" style={{ width: `calc(var(--spacing) * ${n})` }} /><code className="text-xs text-muted">{n} = {px}</code></li>)}</ul>
        <p className="mt-3 text-sm text-muted">Breakpoints: phone first; <code>sm</code> 640px, <code>md</code> 768px, <code>lg</code> 1024px (desktop menu appears, bottom bar hides), <code>xl</code> 1280px. Content width 1200px.</p>
      </section>

      <section aria-labelledby="ds-buttons">
        <h2 id="ds-buttons" className="text-xl font-extrabold">Buttons</h2>
        <div className="mt-3 flex flex-wrap gap-3">
          <Button>Primary</Button><Button variant="flame">Flame</Button><Button variant="outline">Outline</Button><Button variant="ghost">Ghost</Button><Button variant="danger">Danger</Button>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <Button size="sm">Small</Button><Button size="lg">Large</Button><Button loading>Saving</Button><Button disabled>Disabled</Button><Button href="/admin" variant="outline">Link button</Button>
        </div>
        <div className="mt-3 max-w-sm"><Button block variant="flame">Back to feed</Button></div>
      </section>

      <section aria-labelledby="ds-cards">
        <h2 id="ds-cards" className="text-xl font-extrabold">Cards and states</h2>
        <div className="mt-3 grid gap-4 md:grid-cols-3">
          <div className="card p-5"><h3 className="font-bold">Card</h3><p className="text-sm text-muted">Default surface.</p></div>
          <div className="card card-raised p-5"><h3 className="font-bold">Raised card</h3><p className="text-sm text-muted">For menus and sheets.</p></div>
          <a href="#ds-cards" className="card card-interactive block p-5"><h3 className="font-bold">Interactive card</h3><p className="text-sm text-muted">Whole card is the link.</p></a>
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          <Notice tone="info">Information</Notice><Notice tone="ok">Saved</Notice><Notice>Check this</Notice><Notice tone="danger">That didn&apos;t go through. Please try again.</Notice>
        </div>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <div className="card space-y-2 p-5" aria-busy="true"><Skeleton className="h-5 w-1/2" label="Loading" /><Skeleton /><Skeleton className="h-4 w-3/4" /></div>
          <EmptyState title="Nothing here yet." text="Empty state: say what will appear and what to do next." cta={{ href: "/admin", label: "Do the next step" }} />
        </div>
      </section>

      <section aria-labelledby="ds-forms">
        <h2 id="ds-forms" className="text-xl font-extrabold">Form controls</h2>
        <form className="card mt-3 grid max-w-xl gap-4 p-5" action="#">
          <Field id="ds-name" label="Business name" help="As shown on your DTI or SEC papers." required><input className="input" /></Field>
          <Field id="ds-email" label="Email" error="Please enter a valid email."><input className="input" type="email" defaultValue="not-an-email" /></Field>
          <Field id="ds-cat" label="Category"><select className="input" defaultValue=""><option value="" disabled>Choose one</option><option>Food and beverage</option><option>Packaging</option></select></Field>
          <Field id="ds-desc" label="Short description"><textarea className="input" rows={3} /></Field>
          <Field id="ds-off" label="Disabled field"><input className="input" disabled defaultValue="Can't change this" /></Field>
          <label className="flex items-start gap-3"><input type="checkbox" className="check mt-1" /> <span>Checkbox with a full label</span></label>
          <fieldset className="border-t border-line pt-3">
            <legend className="font-bold">Consent switches (off by default)</legend>
            <Switch name="ds_records" label="Transaction records" description="Create and confirm records with other members." />
            <Switch name="ds_marketing" label="Marketing messages" description="News and offers by email or push." />
          </fieldset>
        </form>
      </section>

      <section aria-labelledby="ds-status">
        <h2 id="ds-status" className="text-xl font-extrabold">Status pieces</h2>
        <div className="mt-3 flex flex-wrap items-center gap-4">
          <StatusBadge status="live" /><StatusBadge status="beta" /><StatusBadge status="soon" />
          <span className="inline-flex items-center gap-2 font-semibold">Messages <CountBadge count={3} label="unread messages" /></span>
          <span className="inline-flex items-center gap-2 font-semibold">Home <UnseenDot /></span>
          <Chip>Food and beverage</Chip><Chip pressed onClickHref="#ds-status">Packaging</Chip>
          <Avatar name="Juan Dela Cruz" size={40} />
        </div>
      </section>
    </div>
  );
}
