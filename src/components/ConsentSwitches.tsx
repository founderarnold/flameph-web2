import Link from "next/link";
import { Switch } from "@/components/ui";
import { CONSENTS, POLICY_PAGES, type ConsentKey } from "@/lib/policy";

/** The five consent switches, each separate, in the approved wording (English, then Taglish). Used by the prompt and Settings. */
export function ConsentSwitches({ on }: { on: Partial<Record<ConsentKey, boolean>> }) {
  return (
    <fieldset className="space-y-1">
      <legend className="sr-only">Your choices</legend>
      <p className="text-sm text-muted">Please read the <PolicyLinks /> (version shown on each page). Each switch is separate and starts off. Only switch 1 is needed; saying no to the others never blocks your membership.</p>
      {CONSENTS.map((c) => (
        <Switch
          key={c.key}
          name={`c_${c.key}`}
          defaultChecked={on[c.key] === true}
          label={<>{c.n}. {c.title}{c.required ? <span className="ml-1 text-sm font-normal text-muted">(needed for membership)</span> : <span className="ml-1 text-sm font-normal text-muted">(optional)</span>}</>}
          description={<>{c.en} <i lang="fil">{c.tl}</i></>}
        />
      ))}
    </fieldset>
  );
}

export function PolicyLinks() {
  const p = Object.values(POLICY_PAGES);
  return <>{p.map((x, i) => <span key={x.href}>{i > 0 && (i === p.length - 1 ? " and " : ", ")}<Link className="text-mph underline" href={x.href} target="_blank">{x.title}<span className="sr-only"> (opens in a new tab)</span></Link></span>)}</>;
}
