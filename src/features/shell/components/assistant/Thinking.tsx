import { useEffect, useState } from "react";
import { thinkingLines } from "../../../../lib/assistant/logic";

const LINE_MS = 1500;

/** Three bouncing dots and a line that says what's happening, stopping on the last one. */
export function Thinking({ hasFile }: { hasFile: boolean }) {
  const lines = thinkingLines(hasFile);
  const [line, setLine] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setLine((n) => Math.min(n + 1, lines.length - 1)), LINE_MS);
    return () => clearInterval(id);
  }, [lines.length]);
  return (
    <div className="flex items-center gap-2.5 text-sm text-muted motion-safe:animate-as-rise" role="status" data-testid="assistant-thinking">
      <span aria-hidden className="flex items-center gap-1">
        {[0, 1, 2].map((i) => (
          <span key={i} style={{ animationDelay: `${i * 140}ms` }} className="size-1.5 rounded-full bg-brand motion-safe:animate-as-dot" />
        ))}
      </span>
      <span key={line} className="motion-safe:animate-as-rise">
        {lines[line]}
      </span>
    </div>
  );
}
