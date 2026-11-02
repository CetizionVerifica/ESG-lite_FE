import { useEffect, useState } from "react";
import { Check, Copy, Database, ThumbsDown, ThumbsUp } from "lucide-react";
import { Link } from "react-router-dom";
import { partialAnswer, plainAnswer, reducedMotion, wordCount, type ThreadTurn } from "../../../../lib/assistant/logic";
import { Button, cn, focusRing } from "../../../../ui";
import { AnswerText } from "./AnswerText";

const TICK_MS = 28;
/** A long answer takes no longer than this many ticks to type out. */
const MAX_TICKS = 60;

/** The answer typing itself out, a few words a tick; all at once when motion is off. */
function useReveal(text: string, animate: boolean, onGrow?: () => void, onDone?: () => void) {
  const total = wordCount(text);
  const [words, setWords] = useState(animate && !reducedMotion() ? 0 : total);
  useEffect(() => {
    if (words >= total) return;
    const id = setTimeout(() => {
      setWords((n) => Math.min(total, n + Math.max(1, Math.ceil(total / MAX_TICKS))));
      onGrow?.();
    }, TICK_MS);
    return () => clearTimeout(id);
  }, [words, total, onGrow]);
  const done = words >= total;
  useEffect(() => {
    if (done && animate) onDone?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once, when it finishes
  }, [done]);
  return { shown: done ? text : partialAnswer(text, words), done, skip: () => setWords(total) };
}

const BURST = [
  ["-18px", "-14px"],
  ["0px", "-22px"],
  ["18px", "-14px"],
  ["-14px", "6px"],
  ["14px", "6px"],
];

function IconAction({ label, active, onClick, children }: { label: string; active?: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={active}
      title={label}
      onClick={onClick}
      className={cn("relative rounded-control p-1.5 text-muted transition-[scale,color] hover:bg-tint hover:text-ink active:scale-90", active && "text-brand", focusRing)}
    >
      {children}
    </button>
  );
}

export interface AnswerCardProps {
  turn: ThreadTurn;
  animate: boolean;
  /** The newest answer: the only one that offers follow-up questions. */
  last: boolean;
  onDone: () => void;
  onGrow: () => void;
  onNavigate: () => void;
  onRate: (helpful: boolean) => void;
  onFollowup: (question: string) => void;
}

/** One answer: typed out, then its sources, copy and thumbs, and what to ask next. */
export function AnswerCard({ turn, animate, last, onDone, onGrow, onNavigate, onRate, onFollowup }: AnswerCardProps) {
  const reveal = useReveal(turn.content, animate, onGrow, onDone);
  const [copied, setCopied] = useState(false);

  const copy = () => {
    void navigator.clipboard?.writeText(plainAnswer(turn.content)).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    });
  };

  return (
    <div className="space-y-2" data-testid="assistant-answer">
      <div onClick={reveal.done ? undefined : reveal.skip}>
        <AnswerText text={reveal.shown} onNavigate={onNavigate} />
      </div>
      {reveal.done && (
        <div className="space-y-2 motion-safe:animate-as-rise">
          {turn.usedWork && (
            <p className="flex items-center gap-1 text-xs text-muted" data-testid="assistant-used-work">
              <Database aria-hidden className="size-3 flex-none" />
              From your ESGLite data just now. The screens have the full detail.
            </p>
          )}
          {!!turn.sources?.length && (
            <p className="text-xs text-muted">
              From:{" "}
              {turn.sources.map((s, j) => (
                <span key={s.id}>
                  {j > 0 && " · "}
                  {s.path ? (
                    <Link to={s.path} onClick={onNavigate} className="text-accent underline underline-offset-2 hover:opacity-80">
                      {s.title}
                    </Link>
                  ) : (
                    s.title
                  )}
                </span>
              ))}
            </p>
          )}
          <div className="flex items-center gap-0.5">
            <IconAction label={copied ? "Copied" : "Copy answer"} onClick={copy}>
              {copied ? <Check aria-hidden className="size-3.5 text-brand motion-safe:animate-as-pop" /> : <Copy aria-hidden className="size-3.5" />}
            </IconAction>
            {turn.callId !== undefined && (
              <>
                <IconAction label="This helped" active={turn.helpful === true} onClick={() => onRate(true)}>
                  <ThumbsUp aria-hidden className={cn("size-3.5", turn.helpful === true && "fill-current motion-safe:animate-as-pop")} />
                  {turn.helpful === true &&
                    BURST.map(([x, y]) => (
                      <span key={`${x}${y}`} aria-hidden style={{ "--x": x, "--y": y } as React.CSSProperties} className="pointer-events-none absolute left-1/2 top-1/2 size-1 rounded-full bg-brand opacity-0 motion-safe:animate-as-burst" />
                    ))}
                </IconAction>
                <IconAction label="This didn't help" active={turn.helpful === false} onClick={() => onRate(false)}>
                  <ThumbsDown aria-hidden className={cn("size-3.5", turn.helpful === false && "fill-current")} />
                </IconAction>
              </>
            )}
            {turn.helpful !== undefined && <span className="ml-1 text-xs text-muted motion-safe:animate-as-rise">Thanks for telling me</span>}
          </div>
          {last && !!turn.followups?.length && (
            <div className="flex flex-col items-start gap-1.5" data-testid="assistant-followups">
              {turn.followups.map((q, i) => (
                <span key={q} style={{ animationDelay: `${i * 70}ms` }} className="motion-safe:animate-as-rise">
                  <Button variant="secondary" size="sm" onClick={() => onFollowup(q)}>
                    {q}
                  </Button>
                </span>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
