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

/** Small, safe subset of Markdown: paragraphs, line breaks, "- " bullets, **bold**, `code`, http(s) links. */
export function Markdownish({ text }: { text: string }) {
  const blocks = text.split(/\n{2,}/)
  return (
    <div className="space-y-2">
      {blocks.map((block, b) => {
        const lines = block.split('\n')
        if (lines.every((l) => /^\s*[-*] /.test(l))) {
          return <ul key={b} className="list-disc space-y-0.5 pl-5">{lines.map((l, i) => <li key={i}>{inline(l.replace(/^\s*[-*] /, ''))}</li>)}</ul>
        }
        return <p key={b}>{lines.map((l, i) => <span key={i}>{i > 0 && <br />}{inline(l)}</span>)}</p>
      })}
    </div>
  )
}
