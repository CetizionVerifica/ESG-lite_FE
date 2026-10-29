import { Link } from "react-router-dom";
import { markdownBlocks, type Inline } from "../../../../lib/assistant/logic";

/** One line of an answer: text, bold, code and links to app paths (never HTML). */
function Inlines({ items, onNavigate }: { items: Inline[]; onNavigate?: () => void }) {
  return (
    <>
      {items.map((x, i) => {
        if (x.t === "bold") return <strong key={i} className="font-semibold text-ink">{x.v}</strong>;
        if (x.t === "code") return <code key={i} className="rounded-sm bg-tint px-1 font-mono text-[0.9em]">{x.v}</code>;
        if (x.t === "link")
          return (
            <Link key={i} to={x.to} onClick={onNavigate} className="font-medium text-accent underline underline-offset-2 hover:opacity-80">
              {x.label}
            </Link>
          );
        return <span key={i}>{x.v}</span>;
      })}
    </>
  );
}

/** An assistant answer: the server's small Markdown, rendered as React elements. */
export function AnswerText({ text, onNavigate }: { text: string; onNavigate?: () => void }) {
  return (
    <div className="space-y-2 text-sm leading-relaxed text-ink">
      {markdownBlocks(text).map((b, i) => {
        if (b.type === "p")
          return (
            <p key={i}>
              <Inlines items={b.inlines} onNavigate={onNavigate} />
            </p>
          );
        const List = b.type === "ol" ? "ol" : "ul";
        return (
          <List key={i} className={`space-y-1 pl-5 ${b.type === "ol" ? "list-decimal" : "list-disc"}`}>
            {b.items.map((item, j) => (
              <li key={j}>
                <Inlines items={item} onNavigate={onNavigate} />
              </li>
            ))}
          </List>
        );
      })}
    </div>
  );
}
