/** Plain question-and-answer list that opens one answer at a time on tap. No JavaScript needed. */
export function Faq({ items, title = "Frequently asked questions" }: { items: { q: string; a: string }[]; title?: string }) {
  return (
    <div>
      <h2 className="text-xl font-extrabold sm:text-2xl">{title}</h2>
      <div className="mt-3 divide-y divide-line rounded-2xl border border-line bg-card">
        {items.map((f) => (
          <details key={f.q} className="group px-4 py-1 sm:px-5">
            <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 py-2 font-bold [&::-webkit-details-marker]:hidden">
              {f.q}
              <span aria-hidden className="text-xl leading-none text-primary transition-transform group-open:rotate-45">+</span>
            </summary>
            <p className="pb-4 text-[15px] leading-6 text-muted">{f.a}</p>
          </details>
        ))}
      </div>
    </div>
  );
}
