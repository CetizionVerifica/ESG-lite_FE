// DS-9 · the word diff on a text suggestion card: removed words struck
// through, added words highlighted. Figures inside are the server's displays.
import { useMemo } from "react";
import { cn } from "../../../ui";
import { wordDiff } from "./logic";

export function DiffView({ before, after, className }: { before: string; after: string; className?: string }) {
  const parts = useMemo(() => wordDiff(before, after), [before, after]);
  const onlyNew = !before.trim();
  return (
    <p className={cn("whitespace-pre-wrap text-[13px] leading-relaxed text-ink", className)} data-testid="ai-diff">
      {onlyNew
        ? after
        : parts.map((p, i) =>
            p.op === "same" ? (
              <span key={i}>{p.text}</span>
            ) : p.op === "del" ? (
              <del key={i} className="rounded-sm bg-bad-soft text-bad decoration-bad">
                {p.text}
              </del>
            ) : (
              <ins key={i} className="rounded-sm bg-good-soft text-ink no-underline">
                {p.text}
              </ins>
            ),
          )}
      <span className="sr-only">{onlyNew ? "" : ` New text: ${after}`}</span>
    </p>
  );
}
