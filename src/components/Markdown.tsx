// Tiny, safe Markdown renderer for admin-written content: headings, lists, bold, links, paragraphs. No raw HTML.
import React from "react";

function inline(text: string, key: string): React.ReactNode[] {
  const out: React.ReactNode[] = [];
  const re = /\*\*(.+?)\*\*|\[([^\]]+)\]\((https?:\/\/[^\s)]+|\/[^\s)]*)\)/g;
  let last = 0; let m: RegExpExecArray | null; let i = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    if (m[1]) out.push(<strong key={`${key}-${i++}`}>{m[1]}</strong>);
    else out.push(<a key={`${key}-${i++}`} href={m[3]} {...(m[3].startsWith("http") ? { target: "_blank", rel: "noopener" } : {})}>{m[2]}</a>);
    last = re.lastIndex;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

export function Markdown({ text }: { text: string }) {
  const blocks = text.replace(/\r/g, "").split(/\n{2,}/);
  return (
    <>
      {blocks.map((b, i) => {
        const k = `b${i}`;
        if (/^###\s/.test(b)) return <h3 key={k}>{inline(b.replace(/^###\s/, ""), k)}</h3>;
        if (/^##?\s/.test(b)) return <h2 key={k}>{inline(b.replace(/^##?\s/, ""), k)}</h2>;
        const lines = b.split("\n");
        if (lines.every((l) => /^\s*[-*]\s/.test(l))) return <ul key={k}>{lines.map((l, j) => <li key={j}>{inline(l.replace(/^\s*[-*]\s/, ""), `${k}${j}`)}</li>)}</ul>;
        if (lines.every((l) => /^\s*\d+[.)]\s/.test(l))) return <ol key={k}>{lines.map((l, j) => <li key={j}>{inline(l.replace(/^\s*\d+[.)]\s/, ""), `${k}${j}`)}</li>)}</ol>;
        return <p key={k}>{lines.map((l, j) => <React.Fragment key={j}>{j > 0 && <br />}{inline(l, `${k}${j}`)}</React.Fragment>)}</p>;
      })}
    </>
  );
}
