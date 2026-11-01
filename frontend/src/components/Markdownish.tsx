import type { ReactNode } from 'react'

const TOKEN = /(\*\*[^*]+\*\*|`[^`]+`|https?:\/\/[^\s)]+)/g

/** Inline formatting as React elements. Never builds HTML strings, so user text can't inject markup. */
function inline(text: string): ReactNode[] {
  return text.split(TOKEN).map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**') && part.length > 4) return <strong key={i}>{part.slice(2, -2)}</strong>
    if (part.startsWith('`') && part.endsWith('`') && part.length > 2) return <code key={i} className="rounded bg-muted px-1 text-[0.9em]">{part.slice(1, -1)}</code>
    if (/^https?:\/\//.test(part)) return <a key={i} href={part} target="_blank" rel="noreferrer" className="text-primary underline underline-offset-2">{part}</a>
    return part
  })
}

const HEADING = ['text-xl font-semibold mt-6 first:mt-0', 'text-lg font-semibold mt-5 first:mt-0', 'font-semibold mt-4 first:mt-0']

function blocks(text: string): ReactNode[] {
  return text.split(/\n{2,}/).filter((block) => block.trim()).map((block, b) => {
    const lines = block.split('\n')
    const h = /^(#{1,3}) (.*)$/.exec(lines[0])
    if (h && lines.length === 1) {
      const Tag = (['h2', 'h3', 'h4'] as const)[h[1].length - 1]
      return <Tag key={b} className={HEADING[h[1].length - 1]}>{inline(h[2])}</Tag>
    }
    if (lines.every((l) => /^\s*[-*] /.test(l))) {
      return <ul key={b} className="list-disc space-y-0.5 pl-5">{lines.map((l, i) => <li key={i}>{inline(l.replace(/^\s*[-*] /, ''))}</li>)}</ul>
    }
    if (lines.every((l) => /^\s*\d+[.)] /.test(l))) {
      return <ol key={b} className="list-decimal space-y-0.5 pl-5">{lines.map((l, i) => <li key={i}>{inline(l.replace(/^\s*\d+[.)] /, ''))}</li>)}</ol>
    }
    return <p key={b}>{lines.map((l, i) => <span key={i}>{i > 0 && <br />}{inline(l)}</span>)}</p>
  })
}

/** Small, safe subset of Markdown: paragraphs, # headings, "- " and "1. " lists, ``` code blocks, **bold**, `code`, http(s) links. */
export function Markdownish({ text }: { text: string }) {
  // Odd parts are the insides of ``` fences, kept verbatim (blank lines included).
  const parts = text.split(/^```[^\n]*\n?/m)
  return (
    <div className="space-y-2">
      {parts.map((part, i) => i % 2
        ? <pre key={i} className="overflow-x-auto rounded-md bg-muted px-3 py-2 font-mono text-[0.85em]"><code>{part.replace(/\n$/, '')}</code></pre>
        : blocks(part.trim()))}
    </div>
  )
}
