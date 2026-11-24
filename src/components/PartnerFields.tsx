// Form fields used by the partner application (Step 1) and the Best Offer forms (Steps 2 and 6), in the design-system
// style: label, Taglish or example help, and "(needed to send)" for answers required before sending.

const Need = () => <span className="ml-1 text-xs font-normal text-muted">(needed to send)</span>;

export function Text({ name, label, value, help, need, type = "text", max, auto, placeholder, inputMode }: { name: string; label: string; value?: string | number | null; help?: string; need?: boolean; type?: string; max: number; auto?: string; placeholder?: string; inputMode?: "decimal" | "numeric" | "text" }) {
  return (
    <div className="field">
      <label htmlFor={name} className="label">{label}{need && <Need />}</label>
      <input id={name} name={name} type={type} defaultValue={value ?? ""} maxLength={max} autoComplete={auto} placeholder={placeholder} inputMode={inputMode} className="input" aria-describedby={help ? `${name}-help` : undefined} />
      {help && <p id={`${name}-help`} className="field-help">{help}</p>}
    </div>
  );
}

export function Select({ name, label, value, options, need, help }: { name: string; label: string; value?: string | null; options: [string, string][]; need?: boolean; help?: string }) {
  return (
    <div className="field">
      <label htmlFor={name} className="label">{label}{need && <Need />}</label>
      <select id={name} name={name} defaultValue={value ?? ""} className="input" aria-describedby={help ? `${name}-help` : undefined}>
        <option value="">Choose…</option>
        {options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
      </select>
      {help && <p id={`${name}-help`} className="field-help">{help}</p>}
    </div>
  );
}

export function TextArea({ name, label, value, help, need, max, rows = 4, placeholder }: { name: string; label: string; value?: string | null; help?: string; need?: boolean; max: number; rows?: number; placeholder?: string }) {
  return (
    <div className="field">
      <label htmlFor={name} className="label">{label}{need && <Need />}</label>
      <textarea id={name} name={name} defaultValue={value ?? ""} maxLength={max} rows={rows} placeholder={placeholder} className="input" aria-describedby={help ? `${name}-help` : undefined} />
      {help && <p id={`${name}-help`} className="field-help">{help}</p>}
    </div>
  );
}
